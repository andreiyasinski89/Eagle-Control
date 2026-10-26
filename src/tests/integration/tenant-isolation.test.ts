import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

vi.hoisted(() => {
  Object.assign(process.env, { DATABASE_URL: "postgresql://x", AUTH_SECRET: "test-auth-secret", SECRETS_KEY: Buffer.alloc(32, 5).toString("base64"), STRIPE_SECRET_KEY: "sk_test", STRIPE_PRICE_PRO: "price_x", AI_PROVIDER: "mock" });
});
const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn(async () => undefined) }));
vi.mock("@/server/storage", () => ({ deleteObject: vi.fn(), presignUpload: vi.fn(async () => "https://s3.test/up"), presignDownload: vi.fn(async () => "https://s3.test/dl") }));

import { createWorkspace } from "@/server/services/workspace";
import { archiveNode, createNode, createProject, patchNode, transact } from "@/server/services/nodes/ops";
import { getTree, getNodeDetail, listActivity, listProjects, searchNodes } from "@/server/services/nodes/queries";
import { createComment, deleteComment, listComments, updateComment } from "@/server/services/comments";
import { confirmUpload, downloadUrl, removeAttachment, startUpload } from "@/server/services/attachments";
import { createTag, listTags, setNodeTags } from "@/server/services/tags";
import { listSavedFilters } from "@/server/services/saved-filters";
import { addEntry, clientTimeReport, listEntries, timesheet } from "@/server/services/time";
import { createCompany, getCompany, listCompanies, listCompaniesSchema, updateCompany } from "@/server/services/crm/companies";
import { createContact, getContact, listContacts, listContactsSchema, updateContact } from "@/server/services/crm/contacts";
import { createDeal, getDeal, listDeals, listDealsSchema, moveDeal, updateDeal } from "@/server/services/crm/deals";
import { createActivity, listActivities, listActivitiesSchema } from "@/server/services/crm/activities";
import { listLostReasons, listPipelines } from "@/server/services/crm/pipelines";
import { getMyDay } from "@/server/services/crm/my-day";
import { crmReport } from "@/server/services/crm/reports";
import { listLeadForms } from "@/server/services/crm/lead-ingest";
import { metricsQuerySchema, projectMetrics } from "@/server/services/metrics";
import { calendarQuerySchema, projectBlockLinks, workspaceCalendar } from "@/server/services/nodes/views";
import { createToken, listTokens } from "@/server/public-api/tokens";
import { createEndpoint, listEndpoints } from "@/server/webhooks";
import { getBilling, openPortal, startCheckout } from "@/server/services/billing";
import { aiStatus, applyBreakdown, ask, breakdown, leadReply, summarize } from "@/server/ai";
import { addPortalComment, decide, getPortalNode, getPortalProject, listPortalProjects, portalDownloadUrl, requestApproval, setAttachmentVisibility } from "@/server/services/portal";
import { createLinkCode } from "@/server/integrations/telegram";
import { googleAuthorizeUrl, syncNow } from "@/server/integrations/google";
import { transferOwnership } from "@/server/services/account";
import { listSlackChannels, slackAuthorizeUrl, slackStatus } from "@/server/integrations/slack";
import { authorizeRooms } from "@/server/realtime/access";
import { createLink } from "@/server/services/nodes/ops";

let close: () => Promise<void>;
let a: string; // owner of workspace A
let b: string; // owner of workspace B: a real, signed-in, paying customer who must still see nothing of A
let A: { id: string };
let projectId: string;
let sprintId: string;
let taskId: string;
let taskId2: string;
let commentId: string;
let attachmentId: string;
let dealId: string;
let contactId: string;
let companyId: string;
let activityId: string;
let stageId: string;
let approvalId: string;

const doc = { type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] };
const denied = async (name: string, run: () => Promise<unknown>) => {
  const err = await run().then(() => null, (e: unknown) => e);
  expect(err, `${name} should have been refused`).not.toBeNull();
  expect([402, 403, 404], `${name}: ${(err as Error).message}`).toContain((err as { status?: number }).status);
};

beforeAll(async () => {
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  a = (await t.db.user.create({ data: { email: "a@a.io", name: "Alice" } })).id;
  b = (await t.db.user.create({ data: { email: "b@b.io", name: "Bob" } })).id;
  A = await createWorkspace(a, "Alpha");
  const B = await createWorkspace(b, "Beta");
  await t.db.workspace.updateMany({ where: { id: { in: [A.id, B.id] } }, data: { plan: "PRO" } });

  projectId = (await createProject(a, A.id, { name: "Secret project", template: "agile-sprint-map" })).project.id;
  sprintId = (await getTree(a, projectId)).nodes.find((n) => n.type === "SPRINT")!.id;
  taskId = (await transact(a, (ctx) => createNode(ctx, { parentId: sprintId, type: "TASK", title: "Secret task" }))).result.id;
  taskId2 = (await transact(a, (ctx) => createNode(ctx, { parentId: sprintId, type: "TASK", title: "Other secret task" }))).result.id;
  await transact(a, (ctx) => patchNode(ctx, taskId, { visibleToClient: true }));
  commentId = (await createComment(a, taskId, { body: doc, mentions: [], parentCommentId: null })).id;
  attachmentId = (await t.db.attachment.create({ data: { nodeId: taskId, fileName: "plan.pdf", mime: "application/pdf", size: 5, url: `${A.id}/${taskId}/k-plan.pdf`, uploadedById: a, visibleToClient: true } })).id;
  companyId = (await createCompany(a, A.id, { legalName: "Secret Client Ltd", allowDuplicate: false })).id;
  contactId = (await createContact(a, A.id, { firstName: "Sam", lastName: "Secret", emails: ["sam@secret.io"], phones: [], messengers: {}, consentGiven: false, allowDuplicate: false })).id;
  const deal = await createDeal(a, A.id, { title: "Secret deal", amount: 100, currency: "EUR", companyId });
  dealId = deal.id;
  stageId = (await listPipelines(a, A.id))[0]!.stages[1]!.id;
  activityId = (await createActivity(a, A.id, { type: "NOTE", subject: "Secret note", dealId })).id;
  approvalId = (await requestApproval(a, taskId, {})).id;
}, 120_000);
afterAll(async () => close?.());

describe("a customer of another workspace gets nothing from this one", () => {
  const q = { from: "2026-01-01", to: "2026-12-31" };

  it("cannot read or change projects, nodes, comments, files, tags or time", async () => {
    const cases: [string, () => Promise<unknown>][] = [
      ["getTree", () => getTree(b, projectId)],
      ["getNodeDetail", () => getNodeDetail(b, taskId)],
      ["listActivity", () => listActivity(b, taskId)],
      ["listProjects", () => listProjects(b, A.id)],
      ["searchNodes", () => searchNodes(b, A.id, "Secret")],
      ["patchNode", () => transact(b, (ctx) => patchNode(ctx, taskId, { title: "Hacked" }))],
      ["archiveNode", () => transact(b, (ctx) => archiveNode(ctx, taskId))],
      ["createNode", () => transact(b, (ctx) => createNode(ctx, { parentId: sprintId, type: "TASK", title: "Planted" }))],
      ["createLink", () => transact(b, (ctx) => createLink(ctx, { fromNodeId: taskId, toNodeId: taskId2, kind: "BLOCKS" }))],
      ["listComments", () => listComments(b, taskId)],
      ["createComment", () => createComment(b, taskId, { body: doc, mentions: [], parentCommentId: null })],
      ["updateComment", () => updateComment(b, commentId, doc)],
      ["deleteComment", () => deleteComment(b, commentId)],
      ["startUpload", () => startUpload(b, taskId, { fileName: "x.png", mime: "image/png", size: 5 })],
      ["confirmUpload", () => confirmUpload(b, taskId, { key: `${A.id}/${taskId}/zzzzzzzzzz`, fileName: "x.png", mime: "image/png", size: 5 })],
      ["downloadUrl", () => downloadUrl(b, attachmentId)],
      ["removeAttachment", () => removeAttachment(b, attachmentId)],
      ["setAttachmentVisibility", () => setAttachmentVisibility(b, attachmentId, false)],
      ["listTags", () => listTags(b, A.id)],
      ["createTag", () => createTag(b, A.id, { name: "t", color: "#112233" })],
      ["setNodeTags", () => setNodeTags(b, taskId, [])],
      ["listSavedFilters", () => listSavedFilters(b, A.id)],
      ["listEntries", () => listEntries(b, taskId)],
      ["addEntry", () => addEntry(b, taskId, { minutes: 5, date: "2026-10-26", billable: true })],
      ["timesheet", () => timesheet(b, A.id, new Date())],
      ["clientTimeReport", () => clientTimeReport(b, companyId, { ...q, currency: "EUR", format: "json" })],
    ];
    for (const [name, run] of cases) await denied(name, run);
    const task = await holder.db.node.findUniqueOrThrow({ where: { id: taskId } });
    expect(task).toMatchObject({ title: "Secret task", archivedAt: null });
    expect(await holder.db.comment.count({ where: { nodeId: taskId } })).toBe(1);
  });

  it("cannot read or change CRM data, reports or the pipeline", async () => {
    const cases: [string, () => Promise<unknown>][] = [
      ["getDeal", () => getDeal(b, dealId)],
      ["updateDeal", () => updateDeal(b, dealId, { title: "Hacked" })],
      ["moveDeal", () => moveDeal(b, dealId, { stageId })],
      ["listDeals", () => listDeals(b, A.id, listDealsSchema.parse({}))],
      ["createDeal", () => createDeal(b, A.id, { title: "Planted", amount: 1, currency: "EUR" })],
      ["getContact", () => getContact(b, contactId)],
      ["updateContact", () => updateContact(b, contactId, { firstName: "Hacked" })],
      ["listContacts", () => listContacts(b, A.id, listContactsSchema.parse({}))],
      ["createContact", () => createContact(b, A.id, { firstName: "P", emails: [], phones: [], messengers: {}, consentGiven: false, allowDuplicate: false })],
      ["getCompany", () => getCompany(b, companyId)],
      ["updateCompany", () => updateCompany(b, companyId, { legalName: "Hacked" })],
      ["listCompanies", () => listCompanies(b, A.id, listCompaniesSchema.parse({}))],
      ["listActivities", () => listActivities(b, A.id, listActivitiesSchema.parse({}))],
      ["createActivity", () => createActivity(b, A.id, { type: "NOTE", subject: "Planted", dealId })],
      ["listPipelines", () => listPipelines(b, A.id)],
      ["listLostReasons", () => listLostReasons(b, A.id)],
      ["listLeadForms", () => listLeadForms(b, A.id)],
      ["getMyDay", () => getMyDay(b, A.id)],
      ["crmReport", () => crmReport(b, A.id, { ...q, format: "json", section: "funnel" })],
      ["projectMetrics", () => projectMetrics(b, projectId, metricsQuerySchema.parse({}))],
      ["workspaceCalendar", () => workspaceCalendar(b, A.id, calendarQuerySchema.parse({ from: "2026-10-01", to: "2026-10-31" }))],
      ["projectBlockLinks", () => projectBlockLinks(b, projectId)],
    ];
    for (const [name, run] of cases) await denied(name, run);
    expect((await holder.db.deal.findUniqueOrThrow({ where: { nodeId: dealId } })).stageId).not.toBe(stageId);
    expect(await holder.db.node.count({ where: { workspaceId: A.id, title: { in: ["Planted", "Hacked"] } } })).toBe(0);
  });

  it("cannot use the account, API, billing, AI, portal or integration features of this workspace", async () => {
    const cases: [string, () => Promise<unknown>][] = [
      ["createToken", () => createToken(b, A.id, { name: "x", scope: "write", expiresInDays: 1 })],
      ["listTokens", () => listTokens(b, A.id)],
      ["createEndpoint", () => createEndpoint(b, A.id, { url: "https://example.com/h", events: ["deal.won"] })],
      ["listEndpoints", () => listEndpoints(b, A.id)],
      ["getBilling", () => getBilling(b, A.id)],
      ["startCheckout", () => startCheckout(b, A.id)],
      ["openPortal", () => openPortal(b, A.id)],
      ["aiStatus", () => aiStatus(b, A.id)],
      ["summarize", () => summarize(b, { projectId, audience: "team" })],
      ["ask", () => ask(b, { projectId, question: "What is secret?" })],
      ["breakdown", () => breakdown(b, { nodeId: taskId })],
      ["applyBreakdown", () => applyBreakdown(b, { nodeId: taskId, items: [{ title: "Planted" }] })],
      ["leadReply", () => leadReply(b, { dealId })],
      ["listPortalProjects", () => listPortalProjects(b, A.id)],
      ["getPortalProject", () => getPortalProject(b, projectId)],
      ["getPortalNode", () => getPortalNode(b, taskId)],
      ["addPortalComment", () => addPortalComment(b, taskId, { text: "hi" })],
      ["portalDownloadUrl", () => portalDownloadUrl(b, attachmentId)],
      ["requestApproval", () => requestApproval(b, taskId, {})],
      ["decide", () => decide(b, approvalId, { decision: "APPROVED" })],
      ["telegram link", () => createLinkCode(b, A.id)],
      ["google connect", () => googleAuthorizeUrl(b, A.id)],
      ["google sync", () => syncNow(b, A.id)],
      ["slack connect", () => slackAuthorizeUrl(b, A.id)],
      ["slack channels", () => listSlackChannels(b, A.id)],
      ["slack status", () => slackStatus(b, A.id)],
      ["transferOwnership", () => transferOwnership(b, A.id, b)],
    ];
    for (const [name, run] of cases) await denied(name, run);
    expect((await holder.db.approval.findUniqueOrThrow({ where: { id: approvalId } })).status).toBe("PENDING");
  });

  it("gets no live rooms of this workspace", async () => {
    const rooms = await authorizeRooms(b, [`project:${projectId}`, `board:${A.id}`]);
    expect(rooms.size).toBe(0);
  });

  it("and the owner still can (the checks refuse the stranger, not everyone)", async () => {
    expect((await getTree(a, projectId)).nodes.length).toBeGreaterThan(3);
    expect((await listDeals(a, A.id, listDealsSchema.parse({}))).items).toHaveLength(1);
    expect((await getBilling(a, A.id)).canManage).toBe(true);
    expect((await listTokens(a, A.id)).length).toBe(0);
    void activityId;
    void listEndpoints;
  });
});
