import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/storage", () => ({ deleteObject: vi.fn(), presignUpload: vi.fn(), presignDownload: vi.fn() }));

import { createWorkspace } from "@/server/services/workspace";
import { createContact } from "@/server/services/crm/contacts";
import { createAgentDraft, editAgentDraft, editDraftSchema, listAgentDrafts, markAgentDraftSent, rejectAgentDraft } from "@/server/services/crm/agent-drafts";
import { openChatUrl } from "@/modules/crm/draft-links";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let colleague: string;
let ws: { id: string };
let withConsent: string;
let withoutConsent: string;

const base = { emails: [], phones: [], allowDuplicate: false };
const draft = (contactId: string, text = "Валентин, привет! Как дела?") => createAgentDraft(owner, ws.id, { contactId, channel: "TELEGRAM", text, reason: "ответил вчера" });

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  colleague = (await t.db.user.create({ data: { email: "c@x.io", name: "Colleague" } })).id;
  ws = await createWorkspace(owner, "MWR");
  await t.db.membership.create({ data: { userId: colleague, workspaceId: ws.id, role: "MEMBER", crmAccess: true } });
  withConsent = (await createContact(owner, ws.id, { ...base, firstName: "Валентин", messengers: { telegram: "@valentin_kos" }, consentGiven: true })).id;
  withoutConsent = (await createContact(owner, ws.id, { ...base, firstName: "Ваня", lastName: "Белков", messengers: { telegram: "@ivn" }, consentGiven: false })).id;
}, 120_000);
afterAll(async () => close?.());

describe("Creating a draft", () => {
  it("saves a PENDING draft for a contact with consent", async () => {
    const r = await draft(withConsent);
    expect(r.kind).toBe("draft");
    if (r.kind !== "draft") return;
    expect(r.draft).toMatchObject({ status: "PENDING", channel: "TELEGRAM", contactId: withConsent, userId: owner, reason: "ответил вчера" });
  });

  it("makes no draft without consent: a get-consent task instead, and only one of it", async () => {
    const first = await draft(withoutConsent);
    expect(first).toMatchObject({ kind: "consent_required", created: true });
    const again = await draft(withoutConsent);
    expect(again).toMatchObject({ kind: "consent_required", created: false });
    if (first.kind !== "consent_required" || again.kind !== "consent_required") return;
    expect(again.taskId).toBe(first.taskId);

    expect(await raw.agentDraft.count({ where: { contactId: withoutConsent } })).toBe(0);
    const tasks = await raw.crmActivity.findMany({ where: { contactId: withoutConsent, type: "TASK" } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ source: "agent", completedAt: null, subject: "[агент] Получить согласие: Ваня Белков" });
  });

  it("refuses a contact of another workspace", async () => {
    const other = await raw.user.create({ data: { email: "z@x.io" } });
    const otherWs = await createWorkspace(other.id, "Other");
    const foreign = (await createContact(other.id, otherWs.id, { ...base, firstName: "Чужой", messengers: {}, consentGiven: true })).id;
    await expect(draft(foreign)).rejects.toMatchObject({ status: 422 });
  });
});

describe("Deciding on a draft", () => {
  it("edit approves, reject closes, and neither can be repeated after the draft is settled", async () => {
    const a = await draft(withConsent, "Первый вариант");
    if (a.kind !== "draft") throw new Error("expected a draft");
    const edited = await editAgentDraft(owner, a.draft.id, editDraftSchema.parse({ text: "  Второй вариант  " }));
    expect(edited).toMatchObject({ status: "APPROVED", text: "Второй вариант" });
    const rejected = await rejectAgentDraft(owner, a.draft.id);
    expect(rejected.status).toBe("REJECTED");
    await expect(rejectAgentDraft(owner, a.draft.id)).rejects.toMatchObject({ status: 409, code: "draft_settled" });
    await expect(editAgentDraft(owner, a.draft.id, { text: "поздно" })).rejects.toMatchObject({ status: 409 });
  });

  it("copy marks it SENT and logs exactly one MESSAGE on the contact, even on a double click", async () => {
    const a = await draft(withConsent, "Привет! Предлагаю созвониться в четверг.");
    if (a.kind !== "draft") throw new Error("expected a draft");
    const before = await raw.contact.findUniqueOrThrow({ where: { nodeId: withConsent } });
    const sent = await markAgentDraftSent(owner, a.draft.id);
    expect(sent.status).toBe("SENT");
    await expect(markAgentDraftSent(owner, a.draft.id)).rejects.toMatchObject({ status: 409, code: "draft_settled" });

    const logged = await raw.crmActivity.findMany({ where: { contactId: withConsent, type: "MESSAGE" } });
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ subject: "Сообщение отправлено через Telegram", body: "Привет! Предлагаю созвониться в четверг.", source: "agent", ownerId: owner });
    expect(logged[0]!.completedAt).not.toBeNull();
    const after = await raw.contact.findUniqueOrThrow({ where: { nodeId: withConsent } });
    expect(after.lastContactedAt!.getTime()).toBeGreaterThan(before.lastContactedAt?.getTime() ?? 0);
  });

  it("does not send when consent was withdrawn after the draft was written", async () => {
    const a = await draft(withConsent, "Ещё одно");
    if (a.kind !== "draft") throw new Error("expected a draft");
    await raw.contact.update({ where: { nodeId: withConsent }, data: { consentGiven: false } });
    try {
      await expect(markAgentDraftSent(owner, a.draft.id)).rejects.toMatchObject({ status: 422, code: "consent_required" });
    } finally {
      await raw.contact.update({ where: { nodeId: withConsent }, data: { consentGiven: true } });
    }
    expect((await raw.agentDraft.findUniqueOrThrow({ where: { id: a.draft.id } })).status).toBe("PENDING");
    expect(await raw.crmActivity.count({ where: { contactId: withConsent, type: "MESSAGE" } })).toBe(1);
  });
});

describe("Who sees and touches drafts", () => {
  it("lists only the owner's open drafts, with the chat link", async () => {
    const mine = await listAgentDrafts(owner, ws.id, {});
    expect(mine.items.length).toBeGreaterThan(0);
    expect(mine.items.every((d) => d.status === "PENDING" || d.status === "APPROVED")).toBe(true);
    expect(mine.items[0]).toMatchObject({ contactName: "Валентин", consentGiven: true, openUrl: "https://t.me/valentin_kos" });
    expect((await listAgentDrafts(colleague, ws.id, {})).items).toEqual([]);
    expect((await listAgentDrafts(owner, ws.id, { status: "SENT" })).items).toHaveLength(1);
  });

  it("hides a draft from a colleague: edit, reject and copy answer 404", async () => {
    const a = await draft(withConsent, "Личное");
    if (a.kind !== "draft") throw new Error("expected a draft");
    await expect(editAgentDraft(colleague, a.draft.id, { text: "x" })).rejects.toMatchObject({ status: 404 });
    await expect(rejectAgentDraft(colleague, a.draft.id)).rejects.toMatchObject({ status: 404 });
    await expect(markAgentDraftSent(colleague, a.draft.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("openChatUrl", () => {
  it("builds the link a person would open, or null when the card has no handle", () => {
    expect(openChatUrl("TELEGRAM", { telegram: "@valentin_kos" })).toBe("https://t.me/valentin_kos");
    expect(openChatUrl("TELEGRAM", { telegram: "https://t.me/anna_k" })).toBe("https://t.me/anna_k");
    expect(openChatUrl("TELEGRAM", { telegram: "+48 600 100 200" })).toBe("https://t.me/+48600100200");
    expect(openChatUrl("WHATSAPP", { whatsapp: "+1 (484) 320-9635" })).toBe("https://wa.me/14843209635");
    expect(openChatUrl("INSTAGRAM", { instagram: "@nekitorre" })).toBe("https://ig.me/m/nekitorre");
    expect(openChatUrl("TELEGRAM", {})).toBeNull();
    expect(openChatUrl("TELEGRAM", { telegram: "не писать" })).toBeNull();
    expect(openChatUrl("WHATSAPP", { telegram: "@x" })).toBeNull();
  });
});
