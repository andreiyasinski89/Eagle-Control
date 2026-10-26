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
import { createNode, patchNode, transact } from "@/server/services/nodes/ops";
import { getTree } from "@/server/services/nodes/queries";
import { getNodeDetail } from "@/server/services/nodes/queries";
import { createPipeline, createLostReason, listLostReasons, listPipelines, replaceStages } from "@/server/services/crm/pipelines";
import { createDeal, createProjectFromDeal, getBoard, getDeal, listDeals, loseDeal, moveDeal, reopenDeal, updateDeal, winDeal } from "@/server/services/crm/deals";
import { getCompany, listCompanies } from "@/server/services/crm/companies";
import { archiveContact, contactDuplicateGroups, createContact, gdprErase, gdprExport, getContact, listContacts, setConsent } from "@/server/services/crm/contacts";
import { createActivity, listActivities } from "@/server/services/crm/activities";
import { getClientMap } from "@/server/services/crm/client-map";
import { createLeadForm, getPublicForm, ingestLead, resolveWebhook, rotateWebhookToken } from "@/server/services/crm/lead-ingest";

let close: () => Promise<void>;
let owner: string;
let plain: string; // member without CRM access
let sales: string; // member with CRM access
let admin: string;
let ws: { id: string };
let pipelineId: string;
const stages: Record<string, string> = {};

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();

beforeAll(async () => {
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  const mk = async (email: string) => (await t.db.user.create({ data: { email, name: email.split("@")[0] } })).id;
  [owner, plain, sales, admin] = [await mk("owner@x.io"), await mk("plain@x.io"), await mk("sales@x.io"), await mk("admin@x.io")] as [string, string, string, string];
  ws = await createWorkspace(owner, "Acme");
  await t.db.membership.createMany({
    data: [
      { userId: plain, workspaceId: ws.id, role: "MEMBER", crmAccess: false },
      { userId: sales, workspaceId: ws.id, role: "MEMBER", crmAccess: true },
      { userId: admin, workspaceId: ws.id, role: "ADMIN" },
    ],
  });
  const p = (await listPipelines(owner, ws.id))[0]!;
  pipelineId = p.id;
  for (const s of p.stages) stages[s.name] = s.id;
}, 120_000);

afterAll(async () => close?.());

describe("access", () => {
  it("members without the CRM flag see nothing of the CRM", async () => {
    await expect(listPipelines(plain, ws.id)).rejects.toMatchObject({ status: 403 });
    await expect(getBoard(plain, pipelineId, {})).rejects.toMatchObject({ status: 403 });
    await expect(listDeals(plain, ws.id, { page: 1, pageSize: 10 })).rejects.toMatchObject({ status: 403 });
    await expect(createDeal(plain, ws.id, { title: "x", amount: 0, currency: "EUR" })).rejects.toMatchObject({ status: 403 });
  });
  it("members with the flag can work; an admin always can", async () => {
    expect((await listPipelines(sales, ws.id)).length).toBe(1);
    expect((await listPipelines(admin, ws.id)).length).toBe(1);
  });
});

describe("pipelines", () => {
  it("Free allows one pipeline", async () => {
    await expect(createPipeline(owner, ws.id, { name: "Partners" })).rejects.toMatchObject({ status: 402, code: "plan_limit" });
  });
  it("only owners and admins configure pipelines", async () => {
    await expect(createLostReason(sales, ws.id, "x")).rejects.toMatchObject({ status: 403 });
    expect((await listLostReasons(sales, ws.id)).length).toBeGreaterThan(0);
  });
  it("enforces stage rules and protects stages that hold deals", async () => {
    await holder.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
    const p = await createPipeline(owner, ws.id, { name: "Partners" });
    const open = p.stages.filter((s) => !s.isWon && !s.isLost);

    // a pipeline with two won stages is invalid
    await expect(
      replaceStages(owner, p.id, { stages: [{ id: open[0]!.id, name: "A", probability: 10, isWon: false, isLost: false }, { name: "W1", probability: 100, isWon: true, isLost: false }, { name: "W2", probability: 100, isWon: true, isLost: false }, { name: "L", probability: 0, isWon: false, isLost: true }], moveDealsTo: {} }),
    ).rejects.toMatchObject({ status: 422 });

    const deal = await createDeal(owner, ws.id, { title: "Partner deal", amount: 100, currency: "EUR", pipelineId: p.id });
    const stageOfDeal = deal.stageId;
    const keepAll = p.stages.map((s) => ({ id: s.id, name: s.name, probability: s.probability, isWon: s.isWon, isLost: s.isLost }));

    // deleting the stage that holds the deal needs a destination
    const without = keepAll.filter((s) => s.id !== stageOfDeal);
    await expect(replaceStages(owner, p.id, { stages: without, moveDealsTo: {} })).rejects.toMatchObject({ code: "stage_has_deals" });
    // …and its type cannot flip while it holds deals
    // (swap won/open so the set stays valid but the stage holding the deal would become "won")
    const swapped = keepAll.map((s) => (s.id === stageOfDeal ? { ...s, isWon: true } : s.isWon ? { ...s, isWon: false } : s));
    await expect(replaceStages(owner, p.id, { stages: swapped, moveDealsTo: {} })).rejects.toMatchObject({ code: "stage_flags_locked" });

    const target = without.find((s) => !s.isWon && !s.isLost)!;
    const res = await replaceStages(owner, p.id, { stages: [...without.slice().reverse()], moveDealsTo: { [stageOfDeal]: target.id } });
    expect(res.stages.map((s) => s.order)).toEqual(res.stages.map((_, i) => i));
    expect((await getDeal(owner, deal.id)).stageId).toBe(target.id);
  });
});

describe("lead → deal → project → Client Map (the phase 3 scenario)", () => {
  let dealId: string;
  let contactId: string;
  let companyId: string;
  let projectId: string;

  it("a web-form lead creates a contact, company, deal, message and consent", async () => {
    const form = await createLeadForm(owner, ws.id, { name: "Website", pipelineId, enabled: true, config: { title: "Contact us", submitLabel: "Send", successMessage: "Thanks", consentText: null, redirectUrl: null, fields: [{ key: "name", label: "Name", required: true }, { key: "email", label: "Email", required: true }], allowedOrigins: [], ownerId: sales, stageId: null } });
    expect((await getPublicForm(form.publicKey)).config.title).toBe("Contact us");

    const r = await ingestLead(
      { workspaceId: ws.id, source: `form:${form.id}`, sourceLabel: "Website form", pipelineId: form.pipelineId, ownerId: sales, idempotencyKey: "abc-1" },
      { name: "Anna Kowalska", email: "Anna@Brightly.io", phone: "+48 600 111 222", company: "Brightly", website: "https://www.brightly.io", message: "We need a new website", consent: "on", budget: "12 000" },
    );
    expect(r.status).toBe("created");
    ({ dealId, contactId } = { dealId: r.dealId!, contactId: r.contactId! });
    companyId = r.companyId!;

    const deal = await getDeal(sales, dealId);
    expect(deal).toMatchObject({ stageId: stages["New lead"], amount: 12000, ownerId: sales, companyId, contactId, nextStep: "Reply to the inquiry" });
    const contact = await getContact(sales, contactId);
    expect(contact).toMatchObject({ name: "Anna Kowalska", companyId, consentGiven: true, emails: ["anna@brightly.io"] });
    expect(contact.consentHistory).toHaveLength(1);
    expect((await getCompany(sales, companyId)).legalName).toBe("Brightly");
    expect((await listActivities(sales, ws.id, { dealId, page: 1, pageSize: 10 })).items[0]).toMatchObject({ type: "MESSAGE", subject: "Inquiry via Website form" });
    expect(await holder.db.notification.count({ where: { userId: sales, kind: "lead" } })).toBe(1);
  });

  it("is idempotent, folds repeat inquiries into the open deal, and silently drops bots", async () => {
    const again = await ingestLead({ workspaceId: ws.id, source: "form:x", sourceLabel: "Website form", idempotencyKey: "abc-1" }, { email: "anna@brightly.io" });
    expect(again).toMatchObject({ status: "duplicate", dealId });

    const repeat = await ingestLead({ workspaceId: ws.id, source: "form:x", sourceLabel: "Website form", pipelineId, ownerId: sales }, { name: "Anna", email: "ANNA@brightly.io", message: "Any news?" });
    expect(repeat).toMatchObject({ status: "duplicate", dealId, contactId });
    expect((await listActivities(sales, ws.id, { dealId, page: 1, pageSize: 10 })).total).toBe(2);

    const bot = await ingestLead({ workspaceId: ws.id, source: "form:x", sourceLabel: "Website form" }, { email: "bot@spam.io", hp: "gotcha" });
    expect(bot.status).toBe("rejected");
    await expect(ingestLead({ workspaceId: ws.id, source: "form:x", sourceLabel: "Website form" }, { name: "No contact" })).rejects.toMatchObject({ status: 422, code: "no_contact_method" });
    expect(await holder.db.leadIngest.count({ where: { workspaceId: ws.id, status: "rejected" } })).toBe(2);
    expect(await holder.db.contact.count({ where: { workspaceId: ws.id, emails: { has: "bot@spam.io" } } })).toBe(0);
  });

  it("moves the deal through the pipeline; closing as lost needs a reason", async () => {
    await moveDeal(sales, dealId, { stageId: stages["Qualification"]! });
    expect((await getCompany(sales, companyId)).lifecycleStage).toBe("PROSPECT");

    await expect(loseDeal(sales, dealId, "")).rejects.toMatchObject({ code: "lost_reason_required" });
    const reason = (await listLostReasons(sales, ws.id))[0]!;
    const lost = await loseDeal(sales, dealId, reason.id);
    expect(lost).toMatchObject({ status: "lost", lostReason: reason.name, probability: 0 });

    const reopened = await reopenDeal(sales, dealId);
    expect(reopened).toMatchObject({ status: "open", lostReason: null, stageId: stages["New lead"] });
    await moveDeal(sales, dealId, { stageId: stages["Proposal"]!, afterId: null });
  });

  it("winning marks the company as a customer; a project is created separately from a template, linked to the deal", async () => {
    const won = await winDeal(sales, dealId);
    expect(won).toMatchObject({ status: "won", probability: 100 });
    expect(won.wonAt).toBeTruthy();
    expect((await getCompany(sales, companyId)).lifecycleStage).toBe("CUSTOMER");

    const { project } = await createProjectFromDeal(sales, dealId, { template: "agile-sprint-map" });
    projectId = project.id;
    expect(project.title).toBe(won.title);

    const tree = await getTree(sales, projectId);
    expect(tree.nodes.filter((n) => n.type === "SPRINT")).toHaveLength(4);
    const sprint = tree.nodes.find((n) => n.type === "SPRINT")!;
    expect(sprint.dueDate).toBeTruthy(); // dates come from the template offsets
    expect(tree.project.data).toMatchObject({ dealId, companyId });

    const deal = await getDeal(sales, dealId);
    expect(deal.projects.map((p) => p.id)).toEqual([projectId]);
    expect(deal.activities.some((a) => a.subject.startsWith("Project created"))).toBe(true);
  });

  it("the project appears in the company's Client Map with its own heatmap, and a red project flags the client", async () => {
    let map = await getClientMap(sales, companyId);
    const byType = (t: string) => map.nodes.filter((n) => n.type === t);
    expect(byType("COMPANY")).toHaveLength(1);
    expect(byType("CONTACT")).toHaveLength(1);
    expect(byType("DEAL")).toHaveLength(1);
    const root = map.nodes.find((n) => n.id === projectId)!;
    expect(root).toMatchObject({ type: "PROJECT", parentId: dealId, linked: true });
    expect(map.nodes.filter((n) => n.type === "EPIC")).toHaveLength(2);
    expect(map.atRisk).toBe(false);
    expect(map.nodes.find((n) => n.type === "COMPANY")?.crm).toMatchObject({ atRisk: false, lifecycleStage: "CUSTOMER", revenue: { EUR: 12000 } });

    // an overdue, assigned task makes its sprint, epic and project red
    const epic = (await getTree(sales, projectId)).nodes.find((n) => n.type === "EPIC")!;
    const sprint = (await getTree(sales, projectId)).nodes.find((n) => n.type === "SPRINT" && n.parentId === epic.id)!;
    await transact(sales, (ctx) => createNode(ctx, { parentId: sprint.id, type: "TASK", title: "Late task", assigneeId: sales, startDate: day(-30), dueDate: day(-3) }));
    map = await getClientMap(sales, companyId);
    expect(map.nodes.find((n) => n.title === "Late task")?.health).toBe("RED");
    expect(map.nodes.find((n) => n.id === projectId)?.health).toBe("RED");
    expect(map.atRisk).toBe(true);
    const co = map.nodes.find((n) => n.type === "COMPANY")!;
    expect(co.health).toBe("RED");
    expect(co.crm?.atRisk).toBe(true);
    expect((await getCompany(sales, companyId)).atRisk).toBe(true);
    expect((await listCompanies(sales, ws.id, { sort: "legalName", dir: "asc", page: 1, pageSize: 10 })).items[0]?.projectHealth).toBe("RED");
  });

  it("the CRM tree is invisible to people without the flag, and project operations refuse CRM nodes", async () => {
    await expect(getClientMap(plain, companyId)).rejects.toMatchObject({ status: 404 });
    await expect(getNodeDetail(plain, dealId)).rejects.toMatchObject({ status: 404 });
    await expect(transact(sales, (ctx) => patchNode(ctx, dealId, { title: "renamed" }))).rejects.toMatchObject({ code: "use_crm_endpoint" });
    await expect(createProjectFromDeal(plain, dealId, {})).rejects.toMatchObject({ status: 404 });
  });

  it("Free plan: winning is never blocked by the project limit", async () => {
    await holder.db.workspace.update({ where: { id: ws.id }, data: { plan: "FREE" } });
    for (let i = 0; i < 2; i++) await holder.db.node.create({ data: { workspaceId: ws.id, type: "PROJECT", title: `Filler ${i}`, createdById: owner, data: {} } });
    const d = await createDeal(sales, ws.id, { title: "Second sale", amount: 500, currency: "USD", companyId, primaryContactId: contactId });
    expect((await winDeal(sales, d.id)).status).toBe("won");
    await expect(createProjectFromDeal(sales, d.id, {})).rejects.toMatchObject({ status: 402, code: "plan_limit" });
    await holder.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  });

  it("the board totals per column and per currency, and flags stagnation", async () => {
    await createDeal(sales, ws.id, { title: "Stale one", amount: 1000, currency: "EUR", nextStep: "Call", nextStepAt: day(1), companyId });
    const board = await getBoard(sales, pipelineId, {});
    const won = board.columns.find((c) => c.isWon)!;
    expect(won.totals.byCurrency.EUR?.amount).toBe(12000);
    expect(won.totals.byCurrency.USD?.amount).toBe(500);
    expect(board.columns.map((c) => c.order)).toEqual([...board.columns.map((c) => c.order)].sort((a, b) => a - b));
    // age the deal: idle for a month → red
    const stale = board.columns.flatMap((c) => c.deals).find((d) => d.title === "Stale one")!;
    await holder.db.deal.update({ where: { nodeId: stale.id }, data: { lastActivityAt: new Date(Date.now() - 20 * 86_400_000) } });
    expect((await getDeal(sales, stale.id)).health).toBe("RED");
    const upd = await updateDeal(sales, stale.id, { nextStep: "" });
    expect(upd.nextStep).toBeNull();
  });

  it("activity logging resets the idle clock and the contact's last touch", async () => {
    const old = new Date(Date.now() - 40 * 86_400_000);
    await holder.db.contact.update({ where: { nodeId: contactId }, data: { lastContactedAt: old } });
    const before = (await getContact(sales, contactId)).lastContactedAt!;
    expect(before.getTime()).toBe(old.getTime());
    await createActivity(sales, ws.id, { type: "CALL", subject: "Check-in call", dealId });
    expect((await getContact(sales, contactId)).lastContactedAt!.getTime()).toBeGreaterThan(Date.now() - 60_000);
    const task = await createActivity(sales, ws.id, { type: "TASK", subject: "Send contract", dealId, dueAt: day(2) });
    expect(task.completedAt).toBeNull();
    await expect(createActivity(sales, ws.id, { type: "NOTE", subject: "x", dealId: "nope" })).rejects.toMatchObject({ code: "invalid_deal" });
  });
});

describe("contacts: duplicates, consent and GDPR", () => {
  let victim: string;

  it("warns about duplicates unless told otherwise", async () => {
    const first = await createContact(sales, ws.id, { firstName: "Piotr", lastName: "Nowak", emails: ["piotr@alpha.pl"], phones: ["+48 500 000 111"], messengers: {}, allowDuplicate: false, consentGiven: false });
    victim = first.id;
    await expect(createContact(sales, ws.id, { firstName: "P.", emails: [], phones: ["500-000-111"], messengers: {}, allowDuplicate: false, consentGiven: false })).rejects.toMatchObject({ status: 409, code: "duplicate_contact" });
    const dupe = await createContact(sales, ws.id, { firstName: "Piotr", emails: ["PIOTR@alpha.pl"], phones: [], messengers: {}, allowDuplicate: true, consentGiven: false });
    const groups = await contactDuplicateGroups(sales, ws.id);
    expect(groups.some((g) => g.map((c) => c.id).sort().join() === [victim, dupe.id].sort().join())).toBe(true);
    await archiveContact(sales, dupe.id);
    expect((await contactDuplicateGroups(sales, ws.id)).some((g) => g.some((c) => c.id === dupe.id))).toBe(false);
  });

  it("consent changes leave an audit trail", async () => {
    await setConsent(sales, victim, true, "phone call");
    const granted = await getContact(sales, victim);
    expect(granted.consentGiven).toBe(true);
    await setConsent(sales, victim, false);
    const revoked = await getContact(sales, victim);
    expect(revoked.consentGiven).toBe(false);
    expect(revoked.consentHistory[0]?.revokedAt).toBeTruthy();
  });

  it("exports everything about a person, and erases it only for owners/admins with all traces gone", async () => {
    await createActivity(sales, ws.id, { type: "NOTE", subject: "Met at conference", contactId: victim });
    await ingestLead({ workspaceId: ws.id, source: "form:y", sourceLabel: "Website", pipelineId, ownerId: sales }, { name: "Piotr Nowak", email: "piotr@alpha.pl", message: "hello" });
    const exported = await gdprExport(sales, victim);
    expect(exported.contact.name).toBe("Piotr Nowak");
    expect(exported.activities.length).toBeGreaterThan(0);
    expect(exported.leadSubmissions.length).toBe(1);

    await expect(gdprErase(sales, victim)).rejects.toMatchObject({ status: 403 });
    await gdprErase(admin, victim);

    expect(await holder.db.node.findUnique({ where: { id: victim } })).toBeNull();
    expect(await holder.db.contact.findUnique({ where: { nodeId: victim } })).toBeNull();
    expect(await holder.db.crmActivity.count({ where: { contactId: victim } })).toBe(0);
    expect(await holder.db.leadIngest.count({ where: { contactId: victim } })).toBe(0);
    expect(await holder.db.consentRecord.count({ where: { contactNodeId: victim } })).toBe(0);
    const audit = await holder.db.activityLog.findFirst({ where: { action: "contact.gdpr_erased" } });
    expect(JSON.stringify(audit?.diff)).not.toContain("piotr");
    expect((await listContacts(sales, ws.id, { q: "piotr", sort: "name", dir: "asc", page: 1, pageSize: 10 })).items.filter((c) => c.id === victim)).toHaveLength(0);
  });
});

describe("webhook", () => {
  it("issues a token once, stores only its hash, and rotation revokes the old one", async () => {
    const { token } = await rotateWebhookToken(owner, ws.id, { pipelineId });
    const stored = await holder.db.integration.findFirstOrThrow({ where: { workspaceId: ws.id, kind: "WEBHOOK" } });
    expect(JSON.stringify(stored.config)).not.toContain(token);
    expect(await resolveWebhook(token)).toMatchObject({ workspaceId: ws.id, pipelineId });
    expect(await resolveWebhook("mol_wrong")).toBeNull();
    const second = await rotateWebhookToken(owner, ws.id);
    expect(await resolveWebhook(token)).toBeNull();
    expect(await resolveWebhook(second.token)).toMatchObject({ workspaceId: ws.id, pipelineId });
    await expect(rotateWebhookToken(sales, ws.id)).rejects.toMatchObject({ status: 403 });
  });
});
