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
import { createNode, createProject, transact } from "@/server/services/nodes/ops";
import { getTree } from "@/server/services/nodes/queries";
import { setNodeTags, createTag } from "@/server/services/tags";
import { createCompany, getCompany, listCompanies } from "@/server/services/crm/companies";
import { createContact, getContact, listContacts } from "@/server/services/crm/contacts";
import { createDeal, getDeal } from "@/server/services/crm/deals";
import { createActivity } from "@/server/services/crm/activities";
import { commitImport, exportCompaniesCsv, exportContactsCsv, previewImport } from "@/server/services/crm/imports";
import { mergeCompanies, mergeContacts } from "@/server/services/crm/merge";
import { getMyDay } from "@/server/services/crm/my-day";
import { createTemplate, listTemplates, saveProjectAsTemplate } from "@/server/services/crm/project-templates";
import { parseCsv } from "@/modules/crm/csv";

let close: () => Promise<void>;
let owner: string;
let plain: string;
let ws: { id: string };

const bytes = (s: string) => new TextEncoder().encode(s);
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();
const listArgs = { sort: "name", dir: "asc", page: 1, pageSize: 100 } as const;

beforeAll(async () => {
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "owner@x.io", name: "Owner" } })).id;
  plain = (await t.db.user.create({ data: { email: "plain@x.io", name: "Plain" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.membership.create({ data: { userId: plain, workspaceId: ws.id, role: "MEMBER", crmAccess: false } });
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
}, 120_000);

afterAll(async () => close?.());

describe("CSV import", () => {
  const file = [
    "Имя;Email;Телефон;Компания;Сайт;Должность",
    "Анна Петрова;anna@zeta.io;+7 900 111 22 33;Zeta LLC;https://zeta.io;CEO",
    "Борис Иванов;boris@zeta.io;;ZETA;zeta.io;CTO",
    "Анна П.;ANNA@zeta.io;;;;", // same e-mail as row 1 → duplicate in file
    "Broken;not-an-email;;;;",
    ";;;;;", // empty
  ].join("\n");

  it("previews with a suggested mapping, detected delimiter and per-row verdicts", async () => {
    const p = await previewImport(owner, ws.id, bytes(file), { entity: "contacts", policy: "skip" });
    expect(p.delimiter).toBe(";");
    expect(p.encoding).toBe("utf-8");
    expect(p.mapping).toMatchObject({ firstName: "Имя", email: "Email", phone: "Телефон", company: "Компания", website: "Сайт", position: "Должность" });
    expect(p.summary).toMatchObject({ created: 2, skipped: 1 });
    expect(p.summary.errorCount).toBe(1); // the all-empty line is dropped by the parser, not reported
    expect(p.sample.map((r) => r.action)).toEqual(["create", "create", "skip", "error"]);
    expect(await holder.db.contact.count()).toBe(0); // a dry run writes nothing
  });

  it("commits: creates contacts, links one shared company, reports bad rows with sheet numbers", async () => {
    const r = await commitImport(owner, ws.id, bytes(file), { entity: "contacts", policy: "skip" });
    expect(r).toMatchObject({ created: 2, updated: 0, skipped: 1, errorCount: 1 });
    expect(r.errors[0]).toMatchObject({ row: 5 });
    const list = await listContacts(owner, ws.id, listArgs);
    expect(list.items.map((c) => c.name).sort()).toEqual(["Анна Петрова", "Борис Иванов"]);
    const companies = await listCompanies(owner, ws.id, { sort: "legalName", dir: "asc", page: 1, pageSize: 10 });
    expect(companies.items).toHaveLength(1); // "Zeta LLC", "ZETA" and zeta.io are one company
    expect(list.items.every((c) => c.companyId === companies.items[0]?.id)).toBe(true);
  });

  it("re-importing is safe: skip leaves records alone, update unites e-mails and phones", async () => {
    const again = await commitImport(owner, ws.id, bytes(file), { entity: "contacts", policy: "skip" });
    expect(again).toMatchObject({ created: 0, skipped: 3 });

    const more = "Name,Email,Phone,Position\nAnna Petrova,anna@zeta.io,+7 900 999 00 00,Head of Product\n";
    const r = await commitImport(owner, ws.id, bytes(more), { entity: "contacts", policy: "update" });
    expect(r).toMatchObject({ created: 0, updated: 1 });
    const anna = (await listContacts(owner, ws.id, { ...listArgs, q: "anna@zeta.io" })).items[0]!;
    expect(anna.phones).toHaveLength(2);
    expect(anna.position).toBe("Head of Product");
    expect(await holder.db.contact.count({ where: { emails: { has: "anna@zeta.io" } } })).toBe(1);
  });

  it("imports companies, honours an explicit mapping and decodes legacy Windows-1251 files", async () => {
    // "Название;Город" in cp1251, then "Ромашка;Москва"
    const cp1251 = Uint8Array.from([0xcd, 0xe0, 0xe7, 0xe2, 0xe0, 0xed, 0xe8, 0xe5, 0x3b, 0xc3, 0xee, 0xf0, 0xee, 0xe4, 0x0a, 0xd0, 0xee, 0xec, 0xe0, 0xf8, 0xea, 0xe0, 0x3b, 0xcc, 0xee, 0xf1, 0xea, 0xe2, 0xe0]);
    const p = await previewImport(owner, ws.id, cp1251, { entity: "companies", policy: "skip" });
    expect(p).toMatchObject({ encoding: "windows-1251", encodingGuessed: true });
    expect(p.mapping).toMatchObject({ legalName: "Название", city: "Город" });
    const r = await commitImport(owner, ws.id, cp1251, { entity: "companies", policy: "skip", mapping: { legalName: "Название", city: "Город" } });
    expect(r.created).toBe(1);
    const co = (await listCompanies(owner, ws.id, { q: "Ромашка", sort: "legalName", dir: "asc", page: 1, pageSize: 10 })).items[0];
    expect(co).toMatchObject({ legalName: "Ромашка", city: "Москва" });
  });

  it("requires CRM write access, rejects empty files, and enforces the Free contact limit atomically", async () => {
    await expect(previewImport(plain, ws.id, bytes("a\n1"), { entity: "contacts", policy: "skip" })).rejects.toMatchObject({ status: 403 });
    await expect(previewImport(owner, ws.id, bytes(""), { entity: "contacts", policy: "skip" })).rejects.toMatchObject({ code: "empty_file" });

    await holder.db.workspace.update({ where: { id: ws.id }, data: { plan: "FREE" } });
    const existing = await holder.db.contact.count();
    const fill = 500 - existing - 1; // leave room for exactly one more
    const nodes = Array.from({ length: fill }, (_, i) => ({ id: `fill-${i}`, workspaceId: ws.id, type: "CONTACT" as const, title: `Fill ${i}`, createdById: owner, data: {} }));
    await holder.db.node.createMany({ data: nodes });
    await holder.db.contact.createMany({ data: nodes.map((n, i) => ({ nodeId: n.id, workspaceId: ws.id, firstName: `Fill${i}`, emails: [`fill${i}@f.io`], phones: [] })) });

    const two = "Name,Email\nNew One,one@new.io\nNew Two,two@new.io\n";
    await expect(commitImport(owner, ws.id, bytes(two), { entity: "contacts", policy: "skip" })).rejects.toMatchObject({ status: 402, code: "plan_limit" });
    expect(await holder.db.contact.count({ where: { emails: { has: "one@new.io" } } })).toBe(0); // nothing half-applied
    await holder.db.node.deleteMany({ where: { id: { startsWith: "fill-" } } });
    await holder.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  }, 60_000);
});

describe("export", () => {
  it("writes a parseable CSV, neutralises formulas and leaves an audit entry", async () => {
    await createContact(owner, ws.id, { firstName: "=SUM(1+1)", lastName: "Evil", emails: ["evil@x.io"], phones: [], messengers: { telegram: "@evil" }, allowDuplicate: true, consentGiven: true });
    const csv = await exportContactsCsv(owner, ws.id, { sort: "name", dir: "asc", page: 1, pageSize: 50, q: "evil" });
    const parsed = parseCsv(csv);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.["First name"]).toBe("'=SUM(1+1)");
    expect(parsed.rows[0]).toMatchObject({ Telegram: "@evil", Consent: "yes" });
    expect(parseCsv(await exportCompaniesCsv(owner, ws.id)).rows.length).toBeGreaterThan(0);
    expect(await holder.db.activityLog.count({ where: { action: "export.contacts" } })).toBe(1);
    await expect(exportContactsCsv(plain, ws.id, { sort: "name", dir: "asc", page: 1, pageSize: 50 })).rejects.toMatchObject({ status: 403 });
  });
});

describe("merge", () => {
  it("merges contacts: unites data, moves history, deletes the copies, never inherits consent", async () => {
    const a = await createContact(owner, ws.id, { firstName: "Jan", lastName: "Kowalski", emails: ["jan@k.pl"], phones: [], messengers: {}, allowDuplicate: true, consentGiven: false });
    const b = await createContact(owner, ws.id, { firstName: "Jan", emails: ["j.kowalski@k.pl"], phones: ["+48 511 222 333"], position: "CTO", messengers: { telegram: "@jan" }, allowDuplicate: true, consentGiven: true });
    await createActivity(owner, ws.id, { type: "CALL", subject: "Call with the duplicate", contactId: b.id });
    const deal = await createDeal(owner, ws.id, { title: "Kowalski deal", amount: 10, currency: "EUR", primaryContactId: b.id });
    const tag = await createTag(owner, ws.id, { name: "vip", color: "#ff0000" });
    await setNodeTags(owner, b.id, [tag.id]);
    await holder.db.comment.create({ data: { nodeId: b.id, authorId: owner, body: { type: "doc" } } });

    await expect(mergeContacts(owner, ws.id, { primaryId: a.id, duplicateIds: [a.id] })).rejects.toMatchObject({ code: "invalid_merge" });
    await expect(mergeContacts(plain, ws.id, { primaryId: a.id, duplicateIds: [b.id] })).rejects.toMatchObject({ status: 403 });
    expect(await mergeContacts(owner, ws.id, { primaryId: a.id, duplicateIds: [b.id] })).toEqual({ id: a.id, absorbed: 1 });

    const merged = await getContact(owner, a.id);
    expect(merged).toMatchObject({ position: "CTO", consentGiven: false });
    expect(merged.emails.sort()).toEqual(["j.kowalski@k.pl", "jan@k.pl"]);
    expect(merged.messengers).toEqual({ telegram: "@jan" });
    expect(merged.tags.map((t) => t.name)).toEqual(["vip"]);
    expect(merged.consentHistory).toHaveLength(1); // the history moved, the flag did not
    expect((await getDeal(owner, deal.id)).contactId).toBe(a.id);
    expect(await holder.db.crmActivity.count({ where: { contactId: a.id } })).toBe(1);
    expect(await holder.db.comment.count({ where: { nodeId: a.id } })).toBe(1);
    expect(await holder.db.node.findUnique({ where: { id: b.id } })).toBeNull();
  });

  it("merges companies: people, deals and client projects follow the survivor", async () => {
    const c1 = await createCompany(owner, ws.id, { legalName: "Merge Co", allowDuplicate: true });
    const c2 = await createCompany(owner, ws.id, { legalName: "Merge Company Inc", website: "https://mergeco.example", city: "Lyon", allowDuplicate: true });
    const person = await createContact(owner, ws.id, { firstName: "Mia", emails: ["mia@mergeco.example"], phones: [], messengers: {}, companyId: c2.id, allowDuplicate: true, consentGiven: false });
    const deal = await createDeal(owner, ws.id, { title: "Merge deal", amount: 5, currency: "EUR", companyId: c2.id });
    const { project } = await createProject(owner, ws.id, { name: "Merge project", dueDate: day(10) });
    await holder.db.node.update({ where: { id: project.id }, data: { data: { estimationUnit: "HOURS", companyId: c2.id } } });

    await mergeCompanies(owner, ws.id, { primaryId: c1.id, duplicateIds: [c2.id] });
    const co = await getCompany(owner, c1.id);
    expect(co).toMatchObject({ legalName: "Merge Co", website: "https://mergeco.example", city: "Lyon" });
    expect(co.contacts.map((c) => c.id)).toEqual([person.id]);
    expect(co.deals.map((d) => d.id)).toEqual([deal.id]);
    const moved = await holder.db.node.findUniqueOrThrow({ where: { id: person.id } });
    expect(moved).toMatchObject({ parentId: c1.id, rootId: c1.id });
    expect((await holder.db.node.findUniqueOrThrow({ where: { id: project.id } })).data).toMatchObject({ companyId: c1.id });
    expect(await holder.db.company.findUnique({ where: { nodeId: c2.id } })).toBeNull();
  });
});

describe("My day", () => {
  it("collects overdue and due-today work, CRM tasks, meetings, next steps and cold contacts", async () => {
    const { project } = await createProject(owner, ws.id, { name: "Day project", template: "agile-sprint-map" });
    const epic = (await getTree(owner, project.id)).nodes.find((n) => n.type === "EPIC")!;
    const mk = (title: string, dueDate: string) => transact(owner, (ctx) => createNode(ctx, { parentId: epic.id, type: "TASK", title, assigneeId: owner, dueDate }));
    await mk("Overdue task", day(-3));
    await mk("Task due today", new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000 + 3_600_000).toISOString());
    await mk("Future task", day(5));
    await transact(owner, (ctx) => createNode(ctx, { parentId: epic.id, type: "TASK", title: "Not mine", assigneeId: plain, dueDate: day(-2) }));
    const today = new Date().toISOString().slice(0, 10);
    await transact(owner, (ctx) => createNode(ctx, { parentId: project.id, type: "EVENT", title: "Standup", data: { startsAt: `${today}T09:30:00.000Z`, attendeeIds: [owner] } }));
    await transact(owner, (ctx) => createNode(ctx, { parentId: project.id, type: "EVENT", title: "Other meeting", data: { startsAt: `${today}T11:00:00.000Z`, attendeeIds: [plain] } }));

    const person = await createContact(owner, ws.id, { firstName: "Cold", lastName: "Lead", emails: ["cold@x.io"], phones: [], messengers: {}, allowDuplicate: true, consentGiven: false });
    const deal = await createDeal(owner, ws.id, { title: "No plan deal", amount: 1, currency: "EUR", primaryContactId: person.id });
    await createActivity(owner, ws.id, { type: "TASK", subject: "Send proposal", dueAt: day(-1), dealId: deal.id });
    await createActivity(owner, ws.id, { type: "MEETING", subject: "Demo call", completed: false, dueAt: new Date((Math.floor(Date.now() / 86_400_000) + 1) * 86_400_000 - 60_000).toISOString(), dealId: deal.id });
    const target = await holder.db.node.findFirstOrThrow({ where: { title: "Cold Lead" } });
    await holder.db.reminder.create({ data: { userId: owner, targetNodeId: target.id, remindAt: day(-1) } });

    const d = await getMyDay(owner, ws.id);
    expect(d.crm).toBe(true);
    expect(d.tasks.overdue.map((t) => t.title)).toEqual(["Overdue task"]);
    expect(d.tasks.today.map((t) => t.title)).toEqual(["Task due today"]);
    expect(d.tasks.overdue[0]?.projectTitle).toBe("Day project");
    expect(d.events.map((e) => e.title)).toEqual(["Standup"]);
    expect(d.crmTasks.map((t) => t.subject)).toEqual(["Send proposal"]);
    expect(d.crmTasks[0]?.overdue).toBe(true);
    expect(d.scheduled.map((t) => t.subject)).toEqual(["Demo call"]);
    expect(d.dealsNeedingNextStep.map((x) => x.title)).toContain("No plan deal");
    expect(d.attention.coldContacts.map((c) => c.name)).toContain("Cold Lead");
    expect(d.reminders).toHaveLength(1);
    expect(d.counts.total).toBeGreaterThan(5);
  });

  it("people without CRM access get the Agile half only", async () => {
    const d = await getMyDay(plain, ws.id);
    expect(d.crm).toBe(false);
    expect(d.tasks.overdue.map((t) => t.title)).toEqual(["Not mine"]);
    expect(d.crmTasks).toEqual([]);
    expect(d.dealsNeedingNextStep).toEqual([]);
    expect(d.events.map((e) => e.title)).toEqual(["Other meeting"]);
  });
});

describe("project templates", () => {
  it("lists built-in and custom templates; a custom template creates dated projects", async () => {
    const tpl = await createTemplate(owner, ws.id, {
      name: "Website build",
      defaultDurationDays: 30,
      root: { type: "PROJECT", title: "", children: [{ type: "EPIC", title: "Design", offsetDays: 0, durationDays: 10, children: [{ type: "TASK", title: "Mockups", estimation: 8, offsetDays: 0, durationDays: 5 }] }, { type: "EPIC", title: "Build", offsetDays: 10, durationDays: 20 }] },
    });
    const list = await listTemplates(owner, ws.id);
    expect(list.builtIn.map((t) => t.key)).toContain("agile-sprint-map");
    expect(list.custom).toEqual([{ id: tpl.id, name: "Website build", defaultDurationDays: 30 }]);

    const start = "2026-11-02T00:00:00.000Z";
    const { project } = await createProject(owner, ws.id, { name: "Client site", templateId: tpl.id, startDate: start });
    expect(project.dueDate?.toISOString()).toBe("2026-12-02T00:00:00.000Z"); // start + template length
    const tree = await getTree(owner, project.id);
    const build = tree.nodes.find((n) => n.title === "Build")!;
    expect(build.dueDate?.toISOString()).toBe("2026-12-02T00:00:00.000Z");
    expect(tree.nodes.find((n) => n.title === "Mockups")?.estimation).toBe(8);

    await expect(createProject(owner, ws.id, { name: "x", templateId: "nope" })).rejects.toMatchObject({ status: 404 });
    await expect(createTemplate(plain, ws.id, { name: "t", defaultDurationDays: 5, root: { type: "PROJECT", title: "" } })).resolves.toBeTruthy(); // any member who may create projects
  });

  it("saves a project as a template that reproduces its shape and timing", async () => {
    const { project } = await createProject(owner, ws.id, { name: "Original", templateId: (await listTemplates(owner, ws.id)).custom.find((t) => t.name === "Website build")!.id, startDate: "2026-03-01T00:00:00.000Z" });
    const saved = await saveProjectAsTemplate(owner, project.id, "Copy of website");
    const { project: copy } = await createProject(owner, ws.id, { name: "Copy", templateId: saved.id, startDate: "2027-01-04T00:00:00.000Z" });
    const a = await getTree(owner, project.id);
    const b = await getTree(owner, copy.id);
    expect(b.nodes.map((n) => n.title).sort()).toEqual(a.nodes.map((n) => (n.id === project.id ? "Copy" : n.title)).sort());
    const dueOf = (t: typeof a, title: string) => t.nodes.find((n) => n.title === title)?.dueDate?.toISOString();
    expect(dueOf(a, "Design")).toBe("2026-03-11T00:00:00.000Z");
    expect(dueOf(b, "Design")).toBe("2027-01-14T00:00:00.000Z");
  });
});
