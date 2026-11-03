import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://x",
    AUTH_SECRET: "test-auth-secret",
    APP_URL: "https://app.example.test",
    TELEGRAM_BOT_TOKEN: "tg-token",
    TELEGRAM_WEBHOOK_SECRET: "tg-secret",
    JOBS_MODE: "inline",
  });
});

const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn(async () => undefined) }));
vi.mock("@/server/storage", () => ({ deleteObject: vi.fn(), presignUpload: vi.fn(), presignDownload: vi.fn() }));

import { createWorkspace } from "@/server/services/workspace";
import { createContact } from "@/server/services/crm/contacts";
import { createAgentDraft } from "@/server/services/crm/agent-drafts";
import { agentSettingsSchema, saveAgentSettings } from "@/server/services/crm/agent-settings";
import { handleUpdate } from "@/server/integrations/telegram";
import { deliverAgentRun, draftIdFrom, handleAgentReply } from "@/server/integrations/telegram-agent";
import { runDueAgents } from "../../../agent/schedule";
import type { AgentModel } from "../../../agent/model";

// ── a fake Telegram ────────────────────────────────────────────────────────

interface Call {
  method: string;
  body: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const calls: Call[] = [];
let nextMessageId = 100;
vi.stubGlobal(
  "fetch",
  vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = String(input).split("/").pop() ?? "";
    calls.push({ method, body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: nextMessageId++ } }), { status: 200, headers: { "content-type": "application/json" } });
  }),
);
const sent = (method: string, chat?: string) => calls.filter((c) => c.method === method && (chat === undefined || String(c.body.chat_id) === chat));

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let peer: string;
let ws: { id: string };
let valentin: string;
let anna: string;

const base = { emails: [], phones: [], allowDuplicate: false, consentGiven: true };
const OWNER_CHAT = "111";
const PEER_CHAT = "222";
const callback = (chat: string, data: string, over: Record<string, unknown> = {}) => ({ callback_query: { id: "cb1", data, message: { message_id: 7, text: "✉️ Валентин · Telegram\n\nПривет!\n\n[d:x]", chat: { id: Number(chat), type: "private" }, ...over } } });
const draftFor = async (contactId: string, text = "Валентин, привет! Как дела?") => {
  const r = await createAgentDraft(owner, ws.id, { contactId, channel: "TELEGRAM", text, reason: "ответил вчера" });
  if (r.kind !== "draft") throw new Error("no draft");
  return r.draft;
};

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Андрей", timezone: "Europe/Warsaw" } })).id;
  peer = (await t.db.user.create({ data: { email: "p@x.io", name: "Peer" } })).id;
  ws = await createWorkspace(owner, "MWR");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  await t.db.membership.create({ data: { userId: peer, workspaceId: ws.id, role: "MEMBER", crmAccess: true } });
  await t.db.userIntegration.create({ data: { userId: owner, workspaceId: ws.id, kind: "TELEGRAM", externalId: OWNER_CHAT, config: {} } });
  await t.db.userIntegration.create({ data: { userId: peer, workspaceId: ws.id, kind: "TELEGRAM", externalId: PEER_CHAT, config: {} } });
  valentin = (await createContact(owner, ws.id, { ...base, firstName: "Валентин", messengers: { telegram: "@valentin_kos" }, ownerId: owner })).id;
  anna = (await createContact(owner, ws.id, { ...base, firstName: "Анна", messengers: {}, ownerId: owner })).id;
}, 120_000);
afterAll(async () => close?.());
beforeEach(() => void (calls.length = 0));

describe("Delivery of a run to Telegram", () => {
  it("sends the role's text and every new draft as a message of its own with three buttons", async () => {
    const since = new Date();
    const d1 = await draftFor(valentin);
    const d2 = await draftFor(anna, "Анна, привет!");
    const r = await deliverAgentRun({ userId: owner, workspaceId: ws.id, role: "morning_briefing", output: "Горит: Валентин.", since });
    expect(r).toEqual({ delivered: true, messages: 3 });

    const messages = sent("sendMessage", OWNER_CHAT);
    expect(messages[0]!.body.text).toBe("🌅 Утренний брифинг\n\nГорит: Валентин.");
    const draft = messages.find((m) => String(m.body.text).includes("Валентин · Telegram"))!;
    expect(draft.body.text).toContain("Валентин, привет! Как дела?");
    expect(draft.body.text).toContain("Почему сегодня: ответил вчера");
    expect(draftIdFrom(draft.body.text)).toBe(d1.id);
    expect(draft.body.reply_markup.inline_keyboard[0]).toEqual([
      { text: "Взял", callback_data: `ad:t:${d1.id}` },
      { text: "Изменить", callback_data: `ad:e:${d1.id}` },
      { text: "Пропустить", callback_data: `ad:s:${d1.id}` },
    ]);
    expect(draft.body.reply_markup.inline_keyboard[1]![0]).toMatchObject({ url: "https://t.me/valentin_kos" });
    // A contact without a handle still gets the draft, only no "open the chat" button.
    expect(messages.find((m) => draftIdFrom(m.body.text) === d2.id)!.body.reply_markup.inline_keyboard).toHaveLength(1);
    // Nothing went to the colleague's chat.
    expect(sent("sendMessage", PEER_CHAT)).toEqual([]);
    await raw.agentDraft.deleteMany({ where: { id: { in: [d1.id, d2.id] } } });
  });

  it("sends only the drafts of this run", async () => {
    const old = await draftFor(valentin, "Старый черновик");
    const since = new Date(Date.now() + 1000);
    const r = await deliverAgentRun({ userId: owner, workspaceId: ws.id, role: "evening_report", output: "Итог.", since });
    expect(r.messages).toBe(1);
    expect(sent("sendMessage")[0]!.body.text).toContain("🌙 Итог дня");
    await raw.agentDraft.delete({ where: { id: old.id } });
  });

  it("does nothing for a person who has not linked a chat", async () => {
    const stranger = (await raw.user.create({ data: { email: "s@x.io" } })).id;
    const w = await createWorkspace(stranger, "Solo");
    expect(await deliverAgentRun({ userId: stranger, workspaceId: w.id, role: "morning_briefing", output: "x", since: new Date() })).toEqual({ delivered: false, messages: 0 });
    expect(calls).toEqual([]);
  });
});

describe("The buttons under a draft", () => {
  it("«Взял» logs the message as sent, answers the press and takes the buttons away", async () => {
    const d = await draftFor(valentin);
    await handleUpdate(callback(OWNER_CHAT, `ad:t:${d.id}`, { text: `✉️ Валентин · Telegram

Привет!

[d:${d.id}]` }));
    expect((await raw.agentDraft.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("SENT");
    expect(await raw.crmActivity.count({ where: { contactId: valentin, type: "MESSAGE", source: "agent", body: d.text } })).toBe(1);
    expect(sent("answerCallbackQuery")[0]!.body).toMatchObject({ callback_query_id: "cb1", text: "✅ Взял: записано в карточку контакта" });
    const edit = sent("editMessageText")[0]!.body;
    expect(edit).toMatchObject({ chat_id: OWNER_CHAT, message_id: 7, reply_markup: { inline_keyboard: [] } });
    expect(edit.text).toContain("✅ Взял");
    expect(edit.text).not.toContain("[d:");
  });

  it("«Пропустить» rejects the draft", async () => {
    const d = await draftFor(valentin, "Не сейчас");
    await handleUpdate(callback(OWNER_CHAT, `ad:s:${d.id}`));
    expect((await raw.agentDraft.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("REJECTED");
    expect(sent("answerCallbackQuery")[0]!.body.text).toBe("⏭ Пропущено");
  });

  it("«Изменить» asks for the new text, and the reply replaces the draft and brings it back with buttons", async () => {
    const d = await draftFor(valentin, "Первый вариант");
    await handleUpdate(callback(OWNER_CHAT, `ad:e:${d.id}`));
    const prompt = sent("sendMessage", OWNER_CHAT)[0]!.body;
    expect(prompt.reply_markup).toMatchObject({ force_reply: true });
    expect(draftIdFrom(prompt.text)).toBe(d.id);

    calls.length = 0;
    await handleUpdate({ message: { text: "  Второй вариант  ", chat: { id: Number(OWNER_CHAT), type: "private" }, reply_to_message: { text: prompt.text, message_id: 9 } } });
    const saved = await raw.agentDraft.findUniqueOrThrow({ where: { id: d.id } });
    expect(saved).toMatchObject({ text: "Второй вариант", status: "APPROVED" });
    const back = sent("sendMessage", OWNER_CHAT)[0]!.body;
    expect(back.text).toContain("(изменён)");
    expect(back.text).toContain("Второй вариант");
    expect(back.reply_markup.inline_keyboard[0]).toHaveLength(3);
    expect(sent("editMessageText")[0]!.body).toMatchObject({ message_id: 9, reply_markup: { inline_keyboard: [] } });
  });

  it("says why when the draft cannot be acted on any more", async () => {
    const d = await draftFor(valentin, "Дважды");
    await handleUpdate(callback(OWNER_CHAT, `ad:s:${d.id}`));
    calls.length = 0;
    await handleUpdate(callback(OWNER_CHAT, `ad:t:${d.id}`));
    expect(sent("answerCallbackQuery")[0]!.body).toMatchObject({ show_alert: true, text: "This draft was already sent or rejected" });
    expect((await raw.agentDraft.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("REJECTED");
  });

  it("refuses a colleague's chat and a chat that is linked to nobody", async () => {
    const d = await draftFor(valentin, "Только мой");
    await handleUpdate(callback(PEER_CHAT, `ad:t:${d.id}`));
    expect(sent("answerCallbackQuery")[0]!.body.show_alert).toBe(true);
    await handleUpdate(callback("333", `ad:t:${d.id}`));
    expect(sent("answerCallbackQuery")[1]!.body).toMatchObject({ show_alert: true, text: "Этот чат не привязан к MeetOwl." });
    expect((await raw.agentDraft.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("PENDING");
    expect(await raw.crmActivity.count({ where: { contactId: valentin, body: "Только мой" } })).toBe(0);
  });

  it("ignores buttons it does not know, and a reply that is not about a draft", async () => {
    await handleUpdate(callback(OWNER_CHAT, "something:else"));
    expect(sent("answerCallbackQuery")).toHaveLength(1);
    expect(sent("answerCallbackQuery")[0]!.body.text).toBeUndefined();
    expect(await handleAgentReply({ chatId: OWNER_CHAT, text: "привет", repliedText: "обычное сообщение" })).toBe(false);
  });
});

describe("A scheduled run reaches the chat", () => {
  it("delivers the briefing and the draft the agent saved during the run", async () => {
    await saveAgentSettings(owner, ws.id, agentSettingsSchema.parse({ enabled: true, briefingTime: "08:00", touchesPerDay: 20, meetingsPerDay: 4, goal: "Gold", deadline: null, dailyRunLimit: 40 }));
    let step = 0;
    const model: AgentModel = {
      async complete() {
        step++;
        if (step === 1) return { content: [{ type: "tool_use", id: "t1", name: "create_draft", input: { contactId: valentin, channel: "TELEGRAM", text: "Валентин, созвон в четверг?", reason: "ответил" } }], stopReason: "tool_use", inputTokens: 50, outputTokens: 10, model: "scripted" };
        return { content: [{ type: "text", text: "Горит: Валентин." }], stopReason: "end_turn", inputTokens: 60, outputTokens: 10, model: "scripted" };
      },
    };
    await runDueAgents(new Date("2026-11-03T07:05:00.000Z"), { model });
    const texts = sent("sendMessage", OWNER_CHAT).map((c) => String(c.body.text));
    expect(texts[0]).toBe("🌅 Утренний брифинг\n\nГорит: Валентин.");
    expect(texts[1]).toContain("Валентин, созвон в четверг?");
    expect(texts).toHaveLength(2);
    expect(sent("sendMessage", PEER_CHAT)).toEqual([]);
  });
});
