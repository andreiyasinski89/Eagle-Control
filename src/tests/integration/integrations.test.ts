import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://x",
    AUTH_SECRET: "test-auth-secret",
    APP_URL: "https://app.example.test",
    SECRETS_KEY: Buffer.alloc(32, 7).toString("base64"),
    TELEGRAM_BOT_TOKEN: "tg-token",
    TELEGRAM_WEBHOOK_SECRET: "tg-secret",
    TELEGRAM_BOT_USERNAME: "owl_bot",
    SLACK_CLIENT_ID: "slack-id",
    SLACK_CLIENT_SECRET: "slack-secret",
    SLACK_SIGNING_SECRET: "slack-sign",
    GOOGLE_CAL_CLIENT_ID: "google-id",
    GOOGLE_CAL_CLIENT_SECRET: "google-secret",
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
import { archiveNode, createNode, createProject, patchNode, transact } from "@/server/services/nodes/ops";
import { getTree } from "@/server/services/nodes/queries";
import { notify, deliverPending, setPreference } from "@/server/services/notify";
import { createDeal, winDeal } from "@/server/services/crm/deals";
import { decryptJson } from "@/lib/crypto";
import { signState, verifyState } from "@/server/integrations/common";
import { createLinkCode, disconnectTelegram, handleUpdate, telegramStatus, verifyTelegramSecret } from "@/server/integrations/telegram";
import { announceToSlack, disconnectSlack, handleSlackEvent, listSlackChannels, setSlackRoutes, slackAuthorizeUrl, slackCallback, slackChannel, verifySlackSignature } from "@/server/integrations/slack";
import { disconnectGoogle, googleAuthorizeUrl, googleCallback, googleEventId, handleGoogleWebhook, pollAll, pull, pushEvent, syncNow } from "@/server/integrations/google";
import "@/server/integrations/register";

// ── a fake internet ────────────────────────────────────────────────────────

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
  headers: Record<string, string>;
}
type Responder = (c: Call) => unknown;
const calls: Call[] = [];
let routes: { match: RegExp; method?: string; answer: Responder }[] = [];
const on = (match: RegExp, answer: Responder, method?: string) => void routes.unshift({ match, method, answer });
const sent = (match: RegExp) => calls.filter((c) => match.test(c.url));

const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
  let body: Record<string, unknown> | null = null;
  if (typeof init?.body === "string") body = JSON.parse(init.body) as Record<string, unknown>;
  else if (init?.body instanceof URLSearchParams) body = Object.fromEntries(init.body);
  const call: Call = { url, method: init?.method ?? "GET", body, headers };
  calls.push(call);
  const route = routes.find((r) => r.match.test(url) && (!r.method || r.method === call.method));
  const answer = route ? route.answer(call) : { error: { message: "unrouted" } };
  if (answer instanceof Response) return answer;
  const status = route ? 200 : 404;
  return new Response(JSON.stringify(answer ?? {}), { status, headers: { "content-type": "application/json" } });
});
const reply = (status: number, json: unknown) => new Response(JSON.stringify(json), { status });

let close: () => Promise<void>;
let owner: string;
let member: string;
let ws: { id: string; slug: string };
let freeWs: { id: string };
let sprintId: string;
let projectId: string;

beforeAll(async () => {
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "owner@x.io", name: "Owner" } })).id;
  member = (await t.db.user.create({ data: { email: "member@x.io", name: "Member" } })).id;
  ws = await createWorkspace(owner, "Pro Co");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  await t.db.membership.create({ data: { userId: member, workspaceId: ws.id, role: "MEMBER", crmAccess: true } });
  freeWs = await createWorkspace(owner, "Free Co");
  const { project } = await createProject(owner, ws.id, { name: "Site", template: "agile-sprint-map" });
  projectId = project.id;
  sprintId = (await getTree(owner, projectId)).nodes.find((n) => n.type === "SPRINT")!.id;
}, 120_000);
afterAll(async () => close?.());
beforeEach(() => {
  calls.length = 0;
  routes = [];
  vi.stubGlobal("fetch", fakeFetch);
});
afterEach(() => vi.unstubAllGlobals());

const tgUpdate = (chatId: number, text: string, type = "private") => ({ message: { text, chat: { id: chatId, type, first_name: "Ann" } } });
const tgReplies = (chatId: number) => sent(/api\.telegram\.org\/bottg-token\/sendMessage/).filter((c) => c.body?.chat_id === String(chatId)).map((c) => String(c.body?.text));

// ── plan gating and signed state ───────────────────────────────────────────

describe("common", () => {
  it("signs OAuth state so it cannot be forged, reused after expiry or read as another purpose", () => {
    const s = signState({ u: "u1", w: "w1", p: "x" }, 1000, 5000);
    expect(verifyState(s, 5500)).toMatchObject({ u: "u1", w: "w1" });
    expect(verifyState(s, 6001)).toBeNull();
    expect(verifyState(`${s.split(".")[0]}.AAAA`, 5500)).toBeNull();
    expect(verifyState("garbage", 5500)).toBeNull();
    expect(verifyState(null)).toBeNull();
  });

  it("keeps every integration behind the Pro plan", async () => {
    await expect(createLinkCode(owner, freeWs.id)).rejects.toMatchObject({ status: 402, code: "plan_feature" });
    await expect(googleAuthorizeUrl(owner, freeWs.id)).rejects.toMatchObject({ status: 402 });
    await expect(slackAuthorizeUrl(owner, freeWs.id)).rejects.toMatchObject({ status: 402 });
  });
});

// ── Telegram ───────────────────────────────────────────────────────────────

describe("Telegram", () => {
  beforeEach(() => on(/api\.telegram\.org/, () => ({ ok: true })));

  async function link(userId: string, chatId: number) {
    const { code } = await createLinkCode(userId, ws.id);
    await handleUpdate(tgUpdate(chatId, `/start ${code}`));
    return code;
  }

  it("links a chat with a one-time code and says how to use the bot", async () => {
    const res = await createLinkCode(owner, ws.id);
    expect(res.url).toBe(`https://t.me/owl_bot?start=${res.code}`);
    expect((await telegramStatus(owner, ws.id)).linked).toBe(false);
    await handleUpdate(tgUpdate(111, `/start ${res.code}`));
    expect(await telegramStatus(owner, ws.id)).toMatchObject({ linked: true, chatName: "Ann" });
    expect(tgReplies(111)[0]).toContain("Connected");
    await handleUpdate(tgUpdate(222, `/start ${res.code}`)); // the code is spent
    expect(tgReplies(222)[0]).toContain("not valid");
  });

  it("refuses expired codes, unknown chats and group chats", async () => {
    const { code } = await createLinkCode(member, ws.id, new Date(Date.now() - 3_600_000));
    await handleUpdate(tgUpdate(333, `/start ${code}`));
    expect(tgReplies(333)[0]).toContain("expired");
    await handleUpdate(tgUpdate(333, "/today"));
    expect(tgReplies(333)[1]).toContain("not linked");
    await handleUpdate(tgUpdate(444, "/today", "group"));
    expect(tgReplies(444)).toEqual([]);
  });

  it("checks the webhook secret in constant time", () => {
    expect(verifyTelegramSecret("tg-secret")).toBe(true);
    expect(verifyTelegramSecret("nope")).toBe(false);
    expect(verifyTelegramSecret(null)).toBe(false);
  });

  it("lists today's work, adds tasks and leads, and finishes a task by its number", async () => {
    await link(owner, 111);
    calls.length = 0;
    const due = new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000).toISOString();
    const t = (await transact(owner, (ctx) => createNode(ctx, { parentId: sprintId, type: "TASK", title: "Ship the thing", assigneeId: owner, dueDate: due }))).result;

    await handleUpdate(tgUpdate(111, "/today"));
    expect(tgReplies(111)[0]).toContain("1. Ship the thing");

    await handleUpdate(tgUpdate(111, "/done 1"));
    expect(tgReplies(111)[1]).toContain("Done: Ship the thing");
    expect((await holder.db.node.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("DONE");
    await handleUpdate(tgUpdate(111, "/done 9"));
    expect(tgReplies(111)[2]).toContain("/today first");

    await handleUpdate(tgUpdate(111, "/task Call the bank"));
    expect(tgReplies(111)[3]).toContain("Added “Call the bank”");
    expect(await holder.db.node.count({ where: { title: "Call the bank", assigneeId: owner } })).toBe(1);

    await handleUpdate(tgUpdate(111, "/lead Zoe Nowak zoe@client.io"));
    expect(tgReplies(111)[4]).toContain("Lead added: Zoe Nowak");
    expect(await holder.db.contact.count({ where: { emails: { has: "zoe@client.io" } } })).toBe(1);

    await handleUpdate(tgUpdate(111, "/whatever"));
    expect(tgReplies(111)[5]).toContain("/today");
  });

  it("stops answering when the workspace drops to a plan without integrations", async () => {
    await link(owner, 555);
    await holder.db.workspace.update({ where: { id: ws.id }, data: { plan: "FREE" } });
    calls.length = 0;
    await handleUpdate(tgUpdate(555, "/today"));
    expect(tgReplies(555)[0]).toContain("Not possible");
    await holder.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  });

  it("delivers notifications to a linked chat and leaves unlinked people alone", async () => {
    await link(owner, 111);
    await setPreference(owner, ws.id, "lead", ["app", "telegram"]);
    await setPreference(member, ws.id, "lead", ["app", "telegram"]);
    calls.length = 0;
    await notify({ userId: owner, workspaceId: ws.id, kind: "lead", title: "New lead: Eve", url: "/crm?deal=d1" });
    await notify({ userId: member, workspaceId: ws.id, kind: "lead", title: "New lead: Eve" });
    await deliverPending();
    expect(tgReplies(111).some((m) => m.includes("New lead: Eve") && m.includes("https://app.example.test/w/"))).toBe(true);
    expect(sent(/sendMessage/).length).toBe(1); // member has no chat: skipped, not retried
    expect(await holder.db.notification.count({ where: { userId: member, NOT: { pendingChannels: { isEmpty: true } } } })).toBe(0);
  });

  it("disconnects and says goodbye", async () => {
    await link(owner, 111);
    await disconnectTelegram(owner, ws.id);
    expect((await telegramStatus(owner, ws.id)).linked).toBe(false);
    expect(tgReplies(111).at(-1)).toContain("disconnected");
  });
});

// ── Slack ──────────────────────────────────────────────────────────────────

describe("Slack", () => {
  const install = async () => {
    on(/slack\.com\/api\/oauth\.v2\.access/, () => ({ ok: true, access_token: "xoxb-secret-token", team: { id: "T1", name: "Acme" } }));
    const url = new URL(await slackAuthorizeUrl(owner, ws.id));
    await slackCallback("code-1", url.searchParams.get("state"), owner);
  };

  it("sends an admin to Slack with a signed state, and nobody else", async () => {
    const url = new URL(await slackAuthorizeUrl(owner, ws.id));
    expect(url.origin + url.pathname).toBe("https://slack.com/oauth/v2/authorize");
    expect(url.searchParams.get("client_id")).toBe("slack-id");
    expect(url.searchParams.get("scope")).toContain("chat:write");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.test/api/integrations/slack/callback");
    expect(verifyState(url.searchParams.get("state"))).toMatchObject({ u: owner, w: ws.id, p: "slack" });
    await expect(slackAuthorizeUrl(member, ws.id)).rejects.toMatchObject({ status: 403 });
  });

  it("stores the bot token encrypted and rejects a callback for someone else", async () => {
    await install();
    const row = await holder.db.integration.findUniqueOrThrow({ where: { workspaceId_kind: { workspaceId: ws.id, kind: "SLACK" } } });
    expect(row.secretEnc).not.toContain("xoxb");
    expect(decryptJson<{ botToken: string }>(row.secretEnc!).botToken).toBe("xoxb-secret-token");
    expect(row.config).toMatchObject({ teamId: "T1", teamName: "Acme" });
    const state = new URL(await slackAuthorizeUrl(owner, ws.id)).searchParams.get("state");
    await expect(slackCallback("c", state, member)).rejects.toMatchObject({ code: "invalid_state" });
    await expect(slackCallback("c", "forged", owner)).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("posts each event to its own channel with a link, and stays quiet for events without one", async () => {
    await install();
    on(/slack\.com\/api\/conversations\.list/, () => ({ ok: true, channels: [{ id: "C1", name: "sales" }, { id: "C2", name: "old", is_archived: true }] }));
    on(/slack\.com\/api\/chat\.postMessage/, () => ({ ok: true }));
    expect(await listSlackChannels(owner, ws.id)).toEqual([{ id: "C1", name: "sales" }]);
    await setSlackRoutes(owner, ws.id, { routes: { lead: "C1", deal_won: "C9" } });
    await announceToSlack(ws.id, "lead", { title: "New lead: Ann", body: "Website", url: "/crm?deal=d1" });
    await announceToSlack(ws.id, "project_red", { title: "No channel for this" });
    const posts = sent(/chat\.postMessage/);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.headers.authorization).toBe("Bearer xoxb-secret-token");
    expect(posts[0]!.body).toMatchObject({ channel: "C1" });
    expect(String(posts[0]!.body?.text)).toContain(`https://app.example.test/w/${ws.slug}/crm?deal=d1`);
    await setSlackRoutes(owner, ws.id, { routes: { lead: null } });
    expect((await holder.db.integration.findFirstOrThrow({ where: { workspaceId: ws.id, kind: "SLACK" } })).config).toMatchObject({ routes: { deal_won: "C9" } });
  });

  it("retries once when Slack says slow down, and never throws into the caller", async () => {
    await install();
    await setSlackRoutes(owner, ws.id, { routes: { lead: "C1" } });
    let n = 0;
    on(/chat\.postMessage/, () => (++n === 1 ? reply(429, { ok: false, error: "ratelimited" }) : { ok: true }));
    await announceToSlack(ws.id, "lead", { title: "x" });
    expect(n).toBe(2);
    on(/chat\.postMessage/, () => reply(500, { ok: false, error: "boom" }));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(announceToSlack(ws.id, "lead", { title: "y" })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("announces a won deal after the sale is committed", async () => {
    await install();
    await setSlackRoutes(owner, ws.id, { routes: { deal_won: "C7" } });
    on(/chat\.postMessage/, () => ({ ok: true }));
    const deal = await createDeal(owner, ws.id, { title: "Big one", amount: 500, currency: "EUR" });
    await winDeal(owner, deal.id);
    expect(sent(/chat\.postMessage/).map((c) => c.body?.channel)).toEqual(["C7"]);
    expect(String(sent(/chat\.postMessage/)[0]!.body?.text)).toContain("Big one");
  });

  it("verifies Slack's request signature and rejects replays", () => {
    const body = '{"type":"url_verification","challenge":"abc"}';
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = `v0=${createHmac("sha256", "slack-sign").update(`v0:${ts}:${body}`).digest("hex")}`;
    expect(verifySlackSignature(body, ts, sig)).toBe(true);
    expect(verifySlackSignature(body + " ", ts, sig)).toBe(false);
    expect(verifySlackSignature(body, ts, sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0"))).toBe(false); // always a different last digit
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    expect(verifySlackSignature(body, old, `v0=${createHmac("sha256", "slack-sign").update(`v0:${old}:${body}`).digest("hex")}`)).toBe(false);
    expect(verifySlackSignature(body, null, sig)).toBe(false);
  });

  it("answers the URL check and forgets a workspace that removed the app", async () => {
    await install();
    expect(await handleSlackEvent({ type: "url_verification", challenge: "abc" })).toEqual({ challenge: "abc" });
    await handleSlackEvent({ type: "event_callback", team_id: "OTHER", event: { type: "app_uninstalled" } });
    expect(await holder.db.integration.count({ where: { workspaceId: ws.id, kind: "SLACK" } })).toBe(1);
    await handleSlackEvent({ type: "event_callback", team_id: "T1", event: { type: "app_uninstalled" } });
    expect(await holder.db.integration.count({ where: { workspaceId: ws.id, kind: "SLACK" } })).toBe(0);
  });

  it("messages a person by the Slack account that has their e-mail, and gives up quietly when there is none", async () => {
    await install();
    const notice = { title: "Reminder", body: null, url: `/w/${ws.slug}/x`, kind: "reminder", workspaceId: ws.id };
    const me = { id: owner, email: "owner@x.io", name: "Owner", locale: "en" };
    on(/users\.lookupByEmail/, () => ({ ok: true, user: { id: "U42" } }));
    on(/chat\.postMessage/, () => ({ ok: true }));
    expect(await slackChannel.deliver(me, notice)).toBe(true);
    expect(sent(/chat\.postMessage/)[0]!.body).toMatchObject({ channel: "U42" });
    on(/users\.lookupByEmail/, () => reply(200, { ok: false, error: "users_not_found" }));
    expect(await slackChannel.deliver(me, notice)).toBe(false);
    await disconnectSlack(owner, ws.id);
    expect(await slackChannel.deliver(me, notice)).toBe(false);
  });
});

// ── Google Calendar ────────────────────────────────────────────────────────

describe("Google Calendar", () => {
  const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.y`;
  let eventCounter = 0;
  const created = new Set<string>();

  async function connect(userId = owner) {
    on(/oauth2\.googleapis\.com\/token/, (c) => (c.body?.grant_type === "refresh_token" ? { access_token: "ya29.fresh", expires_in: 3600 } : { access_token: "ya29.first", expires_in: 3600, refresh_token: "1//refresh-secret", id_token: idToken("owner@gmail.test") }));
    on(/calendar\/v3\/calendars\/primary\/events\?/, () => ({ items: [], nextSyncToken: "sync-1" }), "GET");
    on(/events\/watch/, () => ({ resourceId: "res-1", expiration: String(Date.now() + 7 * 86_400_000) }), "POST");
    const state = new URL(await googleAuthorizeUrl(userId, ws.id)).searchParams.get("state");
    await googleCallback("auth-code", state, userId);
  }
  const makeEvent = async (title = "Planning", extra: Record<string, unknown> = {}) => {
    const n = (await transact(owner, (ctx) => createNode(ctx, { parentId: sprintId, type: "EVENT", title }))).result;
    await transact(owner, (ctx) => patchNode(ctx, n.id, { data: { startsAt: "2026-11-02T10:00:00.000Z", endsAt: "2026-11-02T11:00:00.000Z", attendeeIds: [owner, member], ...extra } }));
    await new Promise((r) => setTimeout(r, 120)); // the push runs after commit, in the background
    return n.id;
  };
  const answerWrites = () => {
    on(/calendar\/v3\/calendars\/primary\/events(\?|$)/, (c) => {
      const id = String(c.body?.id);
      if (created.has(id)) return reply(409, { error: { message: "The requested identifier already exists." } }); // like Google: a given id is created once
      created.add(id);
      return { id, etag: `"etag-${++eventCounter}"`, updated: new Date().toISOString(), ...(c.body?.conferenceData ? { hangoutLink: "https://meet.example.test/abc-defg" } : {}) };
    }, "POST");
    on(/calendar\/v3\/calendars\/primary\/events\/[a-v0-9]{32}/, (c) => ({ id: String(c.body?.id), etag: `"etag-patched-${++eventCounter}"` }), "PATCH");
    on(/calendar\/v3\/calendars\/primary\/events\/[a-v0-9]{32}/, () => ({}), "DELETE");
  };

  afterEach(async () => {
    created.clear();
    await holder.db.calendarLink.deleteMany({});
    await holder.db.userIntegration.deleteMany({ where: { kind: "GOOGLE_CALENDAR" } });
  });

  it("sends the person to Google for offline access and keeps the refresh token encrypted", async () => {
    const url = new URL(await googleAuthorizeUrl(owner, ws.id));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toContain("calendar.events");
    await connect();
    const row = await holder.db.userIntegration.findFirstOrThrow({ where: { userId: owner, kind: "GOOGLE_CALENDAR" } });
    expect(row.externalId).toBe("owner@gmail.test");
    expect(row.secretEnc).not.toContain("refresh-secret");
    expect(decryptJson<{ refreshToken: string }>(row.secretEnc!).refreshToken).toBe("1//refresh-secret");
    expect(row.config).toMatchObject({ syncToken: "sync-1", calendarId: "primary", watch: { channelId: expect.any(String), resourceId: "res-1" } });
    const first = sent(/events\?/)[0]!;
    expect(first.url).toContain("timeMin=");
    expect(first.headers.authorization).toBe("Bearer ya29.first");
    await expect(googleCallback("c", "forged", owner)).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("creates the Google event when an event is made here, invites attendees and adds a Meet link on request", async () => {
    await connect();
    answerWrites();
    const id = await makeEvent("Kickoff", { addMeet: true });
    const post = sent(/calendar\/v3\/calendars\/primary\/events\?conferenceDataVersion=1/).find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ summary: "Kickoff", start: { dateTime: "2026-11-02T10:00:00.000Z" }, attendees: [{ email: "member@x.io" }], extendedProperties: { private: { meetowlNodeId: id } } });
    expect(post.body?.conferenceData).toBeTruthy();
    const link = await holder.db.calendarLink.findUniqueOrThrow({ where: { nodeId: id } });
    expect(link.externalId).toBe(googleEventId(id));
    expect((await holder.db.node.findUniqueOrThrow({ where: { id } })).data).toMatchObject({ meetingUrl: "https://meet.example.test/abc-defg" });
  });

  it("updates the same Google event on later changes and deletes it when the event is archived", async () => {
    await connect();
    answerWrites();
    const id = await makeEvent("Retro");
    await transact(owner, (ctx) => patchNode(ctx, id, { title: "Retro (moved)", data: { startsAt: "2026-11-03T09:00:00.000Z", endsAt: "2026-11-03T10:00:00.000Z", attendeeIds: [] } }));
    await new Promise((r) => setTimeout(r, 120));
    const patch = calls.filter((c) => c.method === "PATCH").at(-1)!;
    expect(patch.body).toMatchObject({ summary: "Retro (moved)", start: { dateTime: "2026-11-03T09:00:00.000Z" } });
    expect(created.size).toBe(1); // one Google event for this node, however many pushes raced
    await transact(owner, (ctx) => archiveNode(ctx, id));
    await new Promise((r) => setTimeout(r, 120));
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
    expect(await holder.db.calendarLink.count({ where: { nodeId: id } })).toBe(0);
  });

  it("never creates a second Google event for the same node, even when two pushes race", async () => {
    await connect();
    answerWrites();
    const id = await makeEvent("Racy");
    // A second create finds the event already there: Google answers 409 and we update it instead.
    await holder.db.calendarLink.delete({ where: { nodeId: id } });
    on(/calendar\/v3\/calendars\/primary\/events\?/, () => reply(409, { error: { message: "The requested identifier already exists." } }), "POST");
    calls.length = 0;
    expect(await pushEvent(id)).toBe("created");
    expect(calls.filter((c) => c.method === "PATCH").map((c) => c.url)).toEqual([expect.stringContaining(googleEventId(id))]);
    expect((await holder.db.calendarLink.findUniqueOrThrow({ where: { nodeId: id } })).externalId).toBe(googleEventId(id));
    expect(googleEventId(id)).toMatch(/^[a-v0-9]{32}$/);
    expect(googleEventId("a")).not.toBe(googleEventId("b"));
  });

  it("does nothing for people who have not connected Google", async () => {
    answerWrites();
    const id = await makeEvent("Quiet");
    expect(sent(/googleapis/)).toHaveLength(0);
    expect(await pushEvent(id)).toBe("skipped");
  });

  describe("changes made in Google", () => {
    const remote = (nodeId: string, over: Record<string, unknown> = {}) => ({ id: "x", etag: '"remote-1"', status: "confirmed", summary: "Renamed in Google", start: { dateTime: "2026-11-05T14:00:00+01:00" }, end: { dateTime: "2026-11-05T15:00:00+01:00" }, extendedProperties: { private: { meetowlNodeId: nodeId } }, ...over });
    const listOnce = (items: unknown[]) => on(/calendar\/v3\/calendars\/primary\/events\?.*syncToken/, () => ({ items, nextSyncToken: "sync-2" }), "GET");
    const row = () => holder.db.userIntegration.findFirstOrThrow({ where: { userId: owner, kind: "GOOGLE_CALENDAR" } });

    it("applies a remote edit, ignores our own echo, and ignores events that did not start here", async () => {
      await connect();
      answerWrites();
      const id = await makeEvent("Original");
      const link = await holder.db.calendarLink.findUniqueOrThrow({ where: { nodeId: id } });
      await holder.db.calendarLink.update({ where: { nodeId: id }, data: { lastSyncedAt: new Date(Date.now() + 60_000) } }); // synced after the last local edit

      listOnce([{ ...remote(id), id: link.externalId, etag: link.etag }, { id: "stranger", etag: '"s"', summary: "Dentist", start: { dateTime: "2026-11-05T08:00:00Z" } }]);
      expect(await pull(await row())).toMatchObject({ applied: 0, deleted: 0 }); // echo of our own push + a foreign event

      listOnce([{ ...remote(id), id: link.externalId }]);
      expect(await pull(await row())).toMatchObject({ applied: 1 });
      const node = await holder.db.node.findUniqueOrThrow({ where: { id } });
      expect(node.title).toBe("Renamed in Google");
      expect(node.data).toMatchObject({ startsAt: "2026-11-05T13:00:00.000Z", endsAt: "2026-11-05T14:00:00.000Z" });
      expect((await row()).config).toMatchObject({ syncToken: "sync-2" });
    });

    it("keeps the local version when the node changed here after the last sync", async () => {
      await connect();
      answerWrites();
      const id = await makeEvent("Mine");
      const link = await holder.db.calendarLink.findUniqueOrThrow({ where: { nodeId: id } });
      await holder.db.calendarLink.update({ where: { nodeId: id }, data: { lastSyncedAt: new Date(Date.now() - 3_600_000) } });
      listOnce([{ ...remote(id), id: link.externalId }]);
      calls.length = 0;
      expect(await pull(await row())).toMatchObject({ applied: 0, pushedBack: 1 });
      expect((await holder.db.node.findUniqueOrThrow({ where: { id } })).title).toBe("Mine");
      expect(calls.some((c) => c.method === "PATCH")).toBe(true);
    });

    it("archives the node when the Google event is deleted", async () => {
      await connect();
      answerWrites();
      const id = await makeEvent("Doomed");
      const link = await holder.db.calendarLink.findUniqueOrThrow({ where: { nodeId: id } });
      listOnce([{ ...remote(id), id: link.externalId, status: "cancelled" }]);
      expect(await pull(await row())).toMatchObject({ deleted: 1 });
      expect((await holder.db.node.findUniqueOrThrow({ where: { id } })).archivedAt).not.toBeNull();
      expect(await holder.db.calendarLink.count({ where: { nodeId: id } })).toBe(0);
    });

    it("starts over when Google says the sync token expired", async () => {
      await connect();
      let tries = 0;
      on(/events\?.*syncToken/, () => (++tries === 1 ? reply(410, { error: { message: "Sync token is no longer valid" } }) : { items: [], nextSyncToken: "sync-fresh" }), "GET");
      on(/events\?(?!.*syncToken).*timeMin/, () => ({ items: [], nextSyncToken: "sync-fresh" }), "GET");
      await pull(await row());
      expect((await row()).config).toMatchObject({ syncToken: "sync-fresh" });
    });

    it("pulls when Google calls the webhook with the channel token, and not otherwise", async () => {
      await connect();
      const watch = ((await row()).config as { watch: { channelId: string; token: string } }).watch;
      listOnce([]);
      calls.length = 0;
      expect(await handleGoogleWebhook({ channelId: watch.channelId, token: "wrong", state: "exists" })).toBe("ignored");
      expect(await handleGoogleWebhook({ channelId: "unknown", token: watch.token, state: "exists" })).toBe("ignored");
      expect(await handleGoogleWebhook({ channelId: watch.channelId, token: watch.token, state: "sync" })).toBe("ignored");
      expect(sent(/events\?/)).toHaveLength(0);
      expect(await handleGoogleWebhook({ channelId: watch.channelId, token: watch.token, state: "exists" })).toBe("pulled");
      expect(sent(/events\?.*syncToken=sync-1/)).toHaveLength(1);
    });

    it("polls every calendar and renews a channel that is about to expire", async () => {
      await connect();
      const r = await row();
      await holder.db.userIntegration.update({ where: { id: r.id }, data: { config: { ...(r.config as object), watch: { ...(r.config as { watch: object }).watch, expiration: Date.now() + 3_600_000 } } } });
      listOnce([]);
      on(/channels\/stop/, () => ({}), "POST");
      calls.length = 0;
      expect(await pollAll()).toEqual({ polled: 1, failed: 0 });
      expect(sent(/channels\/stop/)).toHaveLength(1);
      expect(sent(/events\/watch/)).toHaveLength(1);
    });

    it("asks the person to reconnect when Google revokes access", async () => {
      await connect();
      accessTokenExpired();
      on(/oauth2\.googleapis\.com\/token/, () => reply(400, { error: "invalid_grant" }));
      await expect(syncNow(owner, ws.id)).rejects.toThrow(/invalid_grant/);
      expect((await row()).config).toMatchObject({ error: "reconnect" });
      calls.length = 0;
      expect(await pollAll()).toEqual({ polled: 0, failed: 0 }); // skipped until reconnected
    });
  });

  it("disconnects: stops the channel, drops links, forgets the token", async () => {
    await connect();
    answerWrites();
    const id = await makeEvent("Linked");
    on(/channels\/stop/, () => ({}), "POST");
    await disconnectGoogle(owner, ws.id);
    expect(await holder.db.userIntegration.count({ where: { kind: "GOOGLE_CALENDAR" } })).toBe(0);
    expect(await holder.db.calendarLink.count({ where: { nodeId: id } })).toBe(0);
  });
});

/** Forces the next Google call to refresh its access token. */
function accessTokenExpired() {
  vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 2 * 3_600_000 });
  onTestFinished(() => {
    vi.useRealTimers();
  });
}
