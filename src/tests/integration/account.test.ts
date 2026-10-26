import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

vi.hoisted(() => {
  Object.assign(process.env, { DATABASE_URL: "postgresql://x", AUTH_SECRET: "x", SECRETS_KEY: Buffer.alloc(32, 4).toString("base64"), STRIPE_SECRET_KEY: "sk_test", STRIPE_PRICE_PRO: "price_x", GOOGLE_CAL_CLIENT_ID: "g", GOOGLE_CAL_CLIENT_SECRET: "s" });
});
const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
const mail = vi.hoisted(() => ({ sent: [] as { to: string; subject: string; text: string }[] }));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn(async (m: { to: string; subject: string; text: string }) => void mail.sent.push(m)) }));
const storage = vi.hoisted(() => ({ deleted: [] as string[] }));
vi.mock("@/server/storage", () => ({ deleteObject: vi.fn(async (k: string) => void storage.deleted.push(k)), presignUpload: vi.fn(), presignDownload: vi.fn() }));

import { createWorkspace } from "@/server/services/workspace";
import { createNode, createProject, transact } from "@/server/services/nodes/ops";
import { getTree } from "@/server/services/nodes/queries";
import { createComment } from "@/server/services/comments";
import { createDeal } from "@/server/services/crm/deals";
import { addEntry } from "@/server/services/time";
import { encryptJson } from "@/lib/crypto";
import { authenticate, createToken } from "@/server/public-api/tokens";
import { cancelDeletion, consumeChallenge, deletionStatus, eraseAccount, exportAccount, requestDeletion, runDueErasures, sendChallenge, transferOwnership } from "@/server/services/account";

let close: () => Promise<void>;
const u: Record<string, string> = {};
const ws = {} as { w1: string; w2: string; w3: string; w4: string };
const DAY = 86_400_000;
const lastCode = () => /: (\d{6})\n/.exec(mail.sent.at(-1)!.text)![1]!;
const doc = (t: string) => ({ type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
const mk = async (user: string, parentId: string, title: string) => (await transact(user, (ctx) => createNode(ctx, { parentId, type: "TASK", title }))).result.id;
const sprintOf = async (user: string, projectId: string) => (await getTree(user, projectId)).nodes.find((n) => n.type === "SPRINT")!.id;
const calls: { url: string; method: string }[] = [];
let stripeFails = false;
const fake = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  calls.push({ url: String(input), method: init?.method ?? "GET" });
  if (String(input).includes("api.stripe.com") && stripeFails) return new Response("down", { status: 500 });
  return new Response("{}", { status: 200 });
});

beforeAll(async () => {
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  for (const n of ["alice", "bob", "carol", "dave", "erin", "cara", "zed"]) u[n] = (await t.db.user.create({ data: { email: `${n}@x.io`, name: n[0]!.toUpperCase() + n.slice(1) } })).id;
  // W1: alice owns, bob is on the team → alice is blocked until she hands it over.
  ws.w1 = (await createWorkspace(u.alice!, "Team")).id;
  await t.db.membership.create({ data: { userId: u.bob!, workspaceId: ws.w1, role: "MEMBER" } });
  // W2: carol alone, plus a client; has a project, files, a deal.
  ws.w2 = (await createWorkspace(u.carol!, "Carol Studio")).id;
  await t.db.membership.create({ data: { userId: u.cara!, workspaceId: ws.w2, role: "CLIENT" } });
  // W3: two owners; dave may leave.
  ws.w3 = (await createWorkspace(u.dave!, "Shared")).id;
  await t.db.membership.create({ data: { userId: u.zed!, workspaceId: ws.w3, role: "OWNER" } });
  // W4: erin alone with a paid subscription.
  ws.w4 = (await createWorkspace(u.erin!, "Paid")).id;
  await t.db.workspace.updateMany({ where: { id: { in: Object.values(ws) } }, data: { plan: "PRO" } });
  await t.db.subscription.create({ data: { workspaceId: ws.w4, externalId: "sub_123", status: "active", stripeCustomerId: "cus_1" } });
}, 120_000);
afterAll(async () => close?.());
beforeEach(() => {
  mail.sent.length = 0;
  storage.deleted.length = 0;
  calls.length = 0;
  stripeFails = false;
  vi.stubGlobal("fetch", fake);
});
afterEach(() => vi.unstubAllGlobals());

describe("confirmation codes", () => {
  it("e-mails a code that works once, only for the right action, and burns after five wrong guesses", async () => {
    await sendChallenge(u.zed!, "export");
    expect(mail.sent[0]).toMatchObject({ to: "zed@x.io" });
    const code = lastCode();
    await expect(consumeChallenge(u.zed!, "delete", code)).rejects.toMatchObject({ code: "invalid_code" }); // an export code is no deletion code
    await consumeChallenge(u.zed!, "export", code);
    await expect(consumeChallenge(u.zed!, "export", code)).rejects.toMatchObject({ code: "invalid_code" }); // single use

    await sendChallenge(u.zed!, "export");
    const real = lastCode();
    for (let i = 0; i < 5; i++) await expect(consumeChallenge(u.zed!, "export", real === "000000" ? "111111" : "000000")).rejects.toMatchObject({ status: 403 });
    await expect(consumeChallenge(u.zed!, "export", real)).rejects.toMatchObject({ code: "invalid_code" }); // burned
  });

  it("expires after ten minutes, belongs to one person, and is limited to three an hour", async () => {
    const t0 = new Date();
    await sendChallenge(u.cara!, "export", t0);
    const code = lastCode();
    await expect(consumeChallenge(u.cara!, "export", code, new Date(t0.getTime() + 11 * 60_000))).rejects.toMatchObject({ code: "invalid_code" });
    await expect(consumeChallenge(u.bob!, "export", code, t0)).rejects.toMatchObject({ code: "invalid_code" });
    await sendChallenge(u.cara!, "export", t0);
    await sendChallenge(u.cara!, "export", t0);
    await expect(sendChallenge(u.cara!, "export", t0)).rejects.toMatchObject({ status: 429 });
  });
});

describe("export", () => {
  it("contains what the person wrote and set up, and nothing that belongs to anyone else or to the system", async () => {
    const { project } = await createProject(u.bob!, ws.w1, { name: "Bob plan", template: "agile-sprint-map" });
    const sprint = await sprintOf(u.bob!, project.id);
    const mine = await mk(u.bob!, sprint, "Bob's task");
    const hers = await mk(u.alice!, sprint, "Alice's task");
    await createComment(u.bob!, mine, { body: doc("bob wrote this"), mentions: [], parentCommentId: null });
    await createComment(u.alice!, mine, { body: doc("alice wrote that"), mentions: [], parentCommentId: null });
    await addEntry(u.bob!, mine, { minutes: 45, date: "2026-10-26", billable: true, note: "bob time" });
    await holder.db.userIntegration.create({ data: { userId: u.bob!, workspaceId: ws.w1, kind: "GOOGLE_CALENDAR", externalId: "bob@gmail.test", secretEnc: encryptJson({ refreshToken: "1//super-secret-refresh" }), config: {} } });
    const tok = await createToken(u.bob!, ws.w1, { name: "ci", scope: "read", expiresInDays: 5 }).catch(() => null);
    await sendChallenge(u.bob!, "export");
    const data = await exportAccount(u.bob!, lastCode());
    const json = JSON.stringify(data);
    expect(data.profile).toMatchObject({ email: "bob@x.io", name: "Bob" });
    expect(data.memberships.map((m) => m.workspace)).toEqual(["Team"]);
    expect(json).toContain("bob wrote this");
    expect(json).toContain("Bob's task");
    expect(json).toContain("bob time");
    expect(json).not.toContain("alice wrote that");
    expect(json).not.toContain("Alice's task");
    expect(json).not.toContain("super-secret-refresh");
    expect(json).not.toContain("secretEnc");
    expect(json).not.toContain("tokenHash");
    expect(data.integrations).toEqual([expect.objectContaining({ kind: "GOOGLE_CALENDAR", externalId: "bob@gmail.test" })]);
    if (tok) expect(json).not.toContain(tok.token);
    expect(data.accountEvents.map((e) => e.action)).toEqual([]); // the export itself is recorded after it is assembled
    expect((await holder.db.accountEvent.findMany({ where: { userId: u.bob! } })).map((e) => e.action)).toContain("exported");
    void hers;
  });

  it("needs a valid code", async () => {
    await expect(exportAccount(u.bob!, "123456")).rejects.toMatchObject({ code: "invalid_code" });
  });
});

describe("handing a workspace over", () => {
  it("blocks a sole owner of a working team, until someone else owns it", async () => {
    const s = await deletionStatus(u.alice!);
    expect(s.canRequest).toBe(false);
    expect(s.blockers).toEqual([expect.objectContaining({ workspaceId: ws.w1, name: "Team", candidates: 1 })]);
    await sendChallenge(u.alice!, "delete");
    await expect(requestDeletion(u.alice!, { code: lastCode(), confirmEmail: "alice@x.io", alsoRemoveComments: false })).rejects.toMatchObject({ status: 409, code: "ownership_required" });
    expect((await holder.db.user.findUniqueOrThrow({ where: { id: u.alice! } })).deletionRequestedAt).toBeNull();
  });

  it("only an owner can transfer, and only to a team member", async () => {
    await expect(transferOwnership(u.bob!, ws.w1, u.bob!)).rejects.toMatchObject({ status: 403 });
    await expect(transferOwnership(u.alice!, ws.w1, u.alice!)).rejects.toMatchObject({ code: "same_person" });
    await expect(transferOwnership(u.alice!, ws.w1, u.zed!)).rejects.toMatchObject({ code: "not_a_team_member" }); // not in the workspace
    await expect(transferOwnership(u.carol!, ws.w2, u.cara!)).rejects.toMatchObject({ code: "not_a_team_member" }); // a client
    await transferOwnership(u.alice!, ws.w1, u.bob!);
    const roles = Object.fromEntries((await holder.db.membership.findMany({ where: { workspaceId: ws.w1 } })).map((m) => [m.userId, m.role]));
    expect(roles).toEqual({ [u.alice!]: "ADMIN", [u.bob!]: "OWNER" });
    expect((await deletionStatus(u.alice!)).canRequest).toBe(true);
  });
});

describe("scheduling, cancelling and the grace period", () => {
  it("needs the code and the exact e-mail, waits seven days, and can be cancelled", async () => {
    const t0 = new Date("2026-11-01T10:00:00Z");
    await sendChallenge(u.alice!, "delete", t0);
    await expect(requestDeletion(u.alice!, { code: lastCode(), confirmEmail: "someone@else.io", alsoRemoveComments: false }, t0)).rejects.toMatchObject({ code: "email_mismatch" });
    const r = await requestDeletion(u.alice!, { code: lastCode(), confirmEmail: "ALICE@x.io", alsoRemoveComments: false }, t0);
    expect(r).toMatchObject({ result: "scheduled", immediate: false });
    expect(mail.sent.at(-1)!.subject).toContain("will be deleted");
    expect((await deletionStatus(u.alice!)).pending).toBe(true);
    expect(await runDueErasures(new Date(t0.getTime() + 6 * DAY))).toEqual({ erased: 0, blocked: 0, failed: 0 });
    await cancelDeletion(u.alice!);
    expect((await deletionStatus(u.alice!)).pending).toBe(false);
    expect(await runDueErasures(new Date(t0.getTime() + 8 * DAY))).toEqual({ erased: 0, blocked: 0, failed: 0 });
    expect((await holder.db.accountEvent.findMany({ where: { userId: u.alice! }, orderBy: { at: "asc" } })).map((e) => e.action).slice(-2)).toEqual(["deletion_requested", "deletion_cancelled"]);
  });

  it("stops at the last moment if the person became the sole owner of a working team in the meantime", async () => {
    const t0 = new Date("2026-11-01T10:00:00Z");
    await sendChallenge(u.alice!, "delete", t0);
    await requestDeletion(u.alice!, { code: lastCode(), confirmEmail: "alice@x.io", alsoRemoveComments: false }, t0);
    await holder.db.membership.update({ where: { userId_workspaceId: { userId: u.alice!, workspaceId: ws.w1 } }, data: { role: "OWNER" } });
    await holder.db.membership.update({ where: { userId_workspaceId: { userId: u.bob!, workspaceId: ws.w1 } }, data: { role: "MEMBER" } });
    expect(await runDueErasures(new Date(t0.getTime() + 8 * DAY))).toEqual({ erased: 0, blocked: 1, failed: 0 });
    expect((await holder.db.user.findUniqueOrThrow({ where: { id: u.alice! } })).deletedAt).toBeNull();
    expect(mail.sent.at(-1)!.subject).toContain("was not deleted");
    await holder.db.membership.update({ where: { userId_workspaceId: { userId: u.bob!, workspaceId: ws.w1 } }, data: { role: "OWNER" } });
  });
});

describe("erasing an account", () => {
  it("removes a sole-member workspace with its files, anonymises the person and frees the address", async () => {
    const { project } = await createProject(u.carol!, ws.w2, { name: "Carol project", template: "agile-sprint-map" });
    const task = await mk(u.carol!, await sprintOf(u.carol!, project.id), "Client work");
    await holder.db.attachment.create({ data: { nodeId: task, fileName: "a.pdf", mime: "application/pdf", size: 1, url: `${ws.w2}/${task}/k-a.pdf`, uploadedById: u.carol! } });
    await createDeal(u.carol!, ws.w2, { title: "Carol deal", amount: 1, currency: "EUR" });
    await holder.db.session.create({ data: { userId: u.carol!, sessionToken: "carol-session", expires: new Date(Date.now() + DAY) } });
    await holder.db.account.create({ data: { userId: u.carol!, type: "oauth", provider: "google", providerAccountId: "g-carol", refresh_token: "carol-refresh" } });
    await holder.db.notification.create({ data: { userId: u.carol!, workspaceId: ws.w2, kind: "reminder", payload: { title: "x" } } });
    const apiTok = await createToken(u.carol!, ws.w2, { name: "k", scope: "read", expiresInDays: 5 });
    await holder.db.invitation.create({ data: { workspaceId: ws.w1, email: "Carol@X.io", tokenHash: "h1", invitedById: u.bob!, expiresAt: new Date(Date.now() + DAY) } });

    await sendChallenge(u.carol!, "delete");
    await requestDeletion(u.carol!, { code: lastCode(), confirmEmail: "carol@x.io", alsoRemoveComments: false });
    const out = await eraseAccount(u.carol!);
    expect(out).toEqual({ result: "erased" });

    expect(await holder.db.workspace.findUnique({ where: { id: ws.w2 } })).toBeNull();
    expect(await holder.db.node.count({ where: { workspaceId: ws.w2 } })).toBe(0);
    expect(storage.deleted).toEqual([`${ws.w2}/${task}/k-a.pdf`]);
    const me = await holder.db.user.findUniqueOrThrow({ where: { id: u.carol! } });
    expect(me).toMatchObject({ name: "Deleted user", email: `deleted-${u.carol}@deleted.invalid`, emailVerified: null, image: null, avatar: null, skills: [] });
    expect(me.deletedAt).not.toBeNull();
    expect(await holder.db.session.count({ where: { userId: u.carol! } })).toBe(0);
    expect(await holder.db.account.count({ where: { userId: u.carol! } })).toBe(0);
    expect(await holder.db.notification.count({ where: { userId: u.carol! } })).toBe(0);
    expect(await holder.db.membership.count({ where: { userId: u.carol! } })).toBe(0);
    expect(await holder.db.invitation.count({ where: { email: { equals: "carol@x.io", mode: "insensitive" } } })).toBe(0);
    await expect(authenticate(`Bearer ${apiTok.token}`)).rejects.toMatchObject({ status: 401 });
    await expect(deletionStatus(u.carol!)).rejects.toMatchObject({ status: 404 });
    expect(JSON.stringify(await holder.db.user.findMany())).not.toContain("carol@x.io");
    expect(mail.sent.at(-1)).toMatchObject({ to: "carol@x.io", subject: "Your MeetOwl account was deleted" });
    // the old address can be used again, as a brand new person
    const again = await holder.db.user.create({ data: { email: "carol@x.io", name: "New Carol" } });
    expect(again.id).not.toBe(u.carol);
    expect((await holder.db.accountEvent.findMany({ where: { userId: u.carol! } })).map((e) => e.action)).toEqual(["deletion_requested", "deleted"]);
  });

  it("leaves a shared workspace intact: authorship becomes anonymous, assignments are cleared, time and history stay", async () => {
    const { project } = await createProject(u.dave!, ws.w3, { name: "Shared project", template: "agile-sprint-map" });
    const sprint = await sprintOf(u.dave!, project.id);
    const dTask = await mk(u.dave!, sprint, "Dave made this");
    const zTask = await mk(u.zed!, sprint, "Zed made this");
    await holder.db.node.update({ where: { id: zTask }, data: { assigneeId: u.dave! } });
    await addEntry(u.dave!, dTask, { minutes: 90, date: "2026-10-26", billable: true });
    await createComment(u.dave!, zTask, { body: doc("dave's comment"), mentions: [], parentCommentId: null });
    await holder.db.notification.create({ data: { userId: u.zed!, workspaceId: ws.w3, kind: "mention", payload: { title: "Dave mentioned you", byUserId: u.dave! } } });

    await sendChallenge(u.dave!, "delete");
    await requestDeletion(u.dave!, { code: lastCode(), confirmEmail: "dave@x.io", alsoRemoveComments: false });
    await eraseAccount(u.dave!);

    expect(await holder.db.workspace.findUnique({ where: { id: ws.w3 } })).not.toBeNull();
    const made = await holder.db.node.findUniqueOrThrow({ where: { id: dTask }, include: { createdBy: true } });
    expect(made.createdBy.name).toBe("Deleted user");
    expect((await holder.db.node.findUniqueOrThrow({ where: { id: zTask } })).assigneeId).toBeNull();
    expect((await holder.db.timeEntry.findFirstOrThrow({ where: { nodeId: dTask } })).minutes).toBe(90);
    const c = await holder.db.comment.findFirstOrThrow({ where: { nodeId: zTask }, include: { author: true } });
    expect(c.author.name).toBe("Deleted user");
    expect(JSON.stringify(c.body)).toContain("dave's comment"); // kept by default
    expect(await holder.db.notification.count({ where: { userId: u.zed!, kind: "mention" } })).toBe(0); // "Dave mentioned you" is gone from the other person's inbox
    expect(await holder.db.membership.count({ where: { workspaceId: ws.w3 } })).toBe(1);
    expect(storage.deleted).toEqual([]);
  });

  it("can also remove the comments and uploads, without breaking the thread", async () => {
    const q = await createWorkspace(u.bob!, "Bob and Zed");
    await holder.db.membership.create({ data: { userId: u.zed!, workspaceId: q.id, role: "OWNER" } });
    const { project } = await createProject(u.bob!, q.id, { name: "P", template: "agile-sprint-map" });
    const task = await mk(u.bob!, await sprintOf(u.bob!, project.id), "T");
    const root = await createComment(u.bob!, task, { body: doc("bob secret thought"), mentions: [], parentCommentId: null });
    await createComment(u.zed!, task, { body: doc("zed replies"), mentions: [], parentCommentId: root.id });
    await holder.db.attachment.create({ data: { nodeId: task, fileName: "mine.png", mime: "image/png", size: 1, url: `${q.id}/${task}/k-mine.png`, uploadedById: u.bob! } });
    await holder.db.membership.update({ where: { userId_workspaceId: { userId: u.bob!, workspaceId: ws.w1 } }, data: { role: "ADMIN" } });
    await holder.db.membership.update({ where: { userId_workspaceId: { userId: u.alice!, workspaceId: ws.w1 } }, data: { role: "OWNER" } });
    await sendChallenge(u.bob!, "delete");
    await requestDeletion(u.bob!, { code: lastCode(), confirmEmail: "bob@x.io", alsoRemoveComments: true });
    expect(await eraseAccount(u.bob!)).toEqual({ result: "erased" });
    const thread = await holder.db.comment.findMany({ where: { nodeId: task }, orderBy: { createdAt: "asc" } });
    expect(thread.map((c) => JSON.stringify(c.body).includes("[removed]") ? "[removed]" : "zed replies")).toEqual(["[removed]", "zed replies"]);
    expect(JSON.stringify(thread)).not.toContain("bob secret thought");
    expect(await holder.db.attachment.count({ where: { uploadedById: u.bob! } })).toBe(0);
    expect(storage.deleted).toContain(`${q.id}/${task}/k-mine.png`);
  });

  it("cancels the subscription before deleting a paid workspace, and does nothing if Stripe is down", async () => {
    await sendChallenge(u.erin!, "delete");
    await requestDeletion(u.erin!, { code: lastCode(), confirmEmail: "erin@x.io", alsoRemoveComments: false });
    stripeFails = true;
    await expect(eraseAccount(u.erin!)).rejects.toBeTruthy();
    expect(await holder.db.workspace.findUnique({ where: { id: ws.w4 } })).not.toBeNull();
    expect((await holder.db.user.findUniqueOrThrow({ where: { id: u.erin! } })).deletedAt).toBeNull(); // still there; the hourly job retries
    stripeFails = false;
    calls.length = 0;
    expect(await eraseAccount(u.erin!)).toEqual({ result: "erased" });
    expect(calls).toContainEqual({ url: "https://api.stripe.com/v1/subscriptions/sub_123", method: "DELETE" });
    expect(await holder.db.workspace.findUnique({ where: { id: ws.w4 } })).toBeNull();
  });

  it("revokes Google access and leaves no calendar links or integrations behind", async () => {
    const w = await createWorkspace(u.zed!, "Zed alone");
    await holder.db.workspace.update({ where: { id: w.id }, data: { plan: "PRO" } });
    await holder.db.userIntegration.create({ data: { userId: u.zed!, workspaceId: w.id, kind: "GOOGLE_CALENDAR", externalId: "zed@gmail.test", secretEnc: encryptJson({ refreshToken: "1//zed" }), config: { calendarId: "primary", syncToken: null, error: null, watch: null } } });
    await holder.db.membership.deleteMany({ where: { userId: u.zed!, workspaceId: ws.w3 } });
    await sendChallenge(u.zed!, "delete");
    await requestDeletion(u.zed!, { code: lastCode(), confirmEmail: "zed@x.io", alsoRemoveComments: false });
    await eraseAccount(u.zed!);
    expect(calls.some((c) => c.url === "https://oauth2.googleapis.com/revoke")).toBe(true);
    expect(await holder.db.userIntegration.count({ where: { userId: u.zed! } })).toBe(0);
  });

  it("refuses to erase someone who is already gone", async () => {
    await expect(eraseAccount(u.carol!)).rejects.toMatchObject({ status: 404 });
  });
});
