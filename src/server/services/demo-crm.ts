import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { createActivity } from "./crm/activities";
import { createCompany } from "./crm/companies";
import { createContact } from "./crm/contacts";
import { createDeal, loseDeal, moveDeal, winDeal } from "./crm/deals";
import { createLeadForm } from "./crm/lead-ingest";
import { listLostReasons, listPipelines } from "./crm/pipelines";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const ahead = (days: number) => new Date(Date.now() + days * DAY).toISOString();

/**
 * A small client book for the demo workspace: three companies, four people and deals in every state.
 * The won deal is linked to the demo project, so the Client Map of "Brightly" shows a live (red) project.
 */
export async function createDemoCrm(userId: string, workspaceId: string, people: { a: string; b: string }, projectId?: string) {
  const [pipeline] = await listPipelines(userId, workspaceId);
  if (!pipeline) return;
  const stage = (name: string) => pipeline.stages.find((s) => s.name === name)?.id as string;
  const reason = (await listLostReasons(userId, workspaceId))[0];

  const brightly = await createCompany(userId, workspaceId, { legalName: "Brightly", website: "https://brightly.io", industry: "Marketing", country: "PL", city: "Warsaw", source: "Referral", ownerId: people.a, lifecycleStage: "CUSTOMER", allowDuplicate: true });
  const nordwind = await createCompany(userId, workspaceId, { legalName: "Nordwind GmbH", website: "https://nordwind.example", industry: "Logistics", country: "DE", city: "Hamburg", source: "Conference", ownerId: people.b, lifecycleStage: "PROSPECT", allowDuplicate: true });
  const kowalski = await createCompany(userId, workspaceId, { legalName: "Kowalski & Co", industry: "Retail", country: "PL", city: "Gdańsk", source: "Website", ownerId: people.a, lifecycleStage: "LEAD", allowDuplicate: true });

  const person = (firstName: string, lastName: string, email: string, position: string, companyId: string, ownerId: string, extra: { phone?: string; telegram?: string } = {}) =>
    createContact(userId, workspaceId, { firstName, lastName, emails: [email], phones: extra.phone ? [extra.phone] : [], position, companyId, ownerId, messengers: extra.telegram ? { telegram: extra.telegram } : {}, allowDuplicate: true, consentGiven: true });
  const anna = await person("Anna", "Kowalska", "anna@brightly.io", "CEO", brightly.id, people.a, { phone: "+48 600 111 222", telegram: "@annak" });
  const piotr = await person("Piotr", "Nowak", "piotr@nordwind.example", "Head of Digital", nordwind.id, people.b, { phone: "+49 40 123 456 78" });
  const mia = await person("Mia", "Lind", "mia@nordwind.example", "Product Manager", nordwind.id, people.b);
  const ivan = await person("Ivan", "Petrov", "ivan@kowalski.example", "Owner", kowalski.id, people.a, { telegram: "@ipetrov" });
  void mia;

  const deal = (title: string, amount: number, currency: string, companyId: string, contactId: string, ownerId: string, stageName: string, extra: { nextStep?: string; nextStepAt?: string; expected?: string } = {}) =>
    createDeal(userId, workspaceId, { title, amount, currency, pipelineId: pipeline.id, stageId: stage(stageName) === stage("Won") ? undefined : stage(stageName), companyId, primaryContactId: contactId, ownerId, source: "Demo", nextStep: extra.nextStep ?? null, nextStepAt: extra.nextStepAt ?? null, expectedCloseDate: extra.expected ?? null });

  const launch = await deal("Brightly — Product launch", 24000, "EUR", brightly.id, anna.id, people.a, "New lead", { nextStep: "Kick-off call", nextStepAt: ahead(2) });
  await winDeal(userId, launch.id);
  await deal("Brightly — Maintenance retainer", 6000, "EUR", brightly.id, anna.id, people.a, "Proposal", { nextStep: "Send the revised quote", nextStepAt: ahead(2), expected: ahead(14) });
  await deal("Nordwind — Website redesign", 15000, "EUR", nordwind.id, piotr.id, people.b, "Qualification");
  const app = await deal("Nordwind — Mobile app", 40000, "USD", nordwind.id, piotr.id, people.b, "Negotiation", { nextStep: "Legal review of the contract", nextStepAt: ahead(-3), expected: ahead(20) });
  await deal("Kowalski — Branding", 3000, "EUR", kowalski.id, ivan.id, people.a, "New lead", { nextStep: "Reply to the inquiry", nextStepAt: ahead(1) });
  const old = await deal("Old Retail — SEO audit", 2500, "EUR", kowalski.id, ivan.id, people.a, "Qualification");
  if (reason) await loseDeal(userId, old.id, reason.id);
  await moveDeal(userId, app.id, { stageId: stage("Negotiation") });

  await createActivity(userId, workspaceId, { type: "CALL", subject: "Discovery call", body: "Walked through the scope and timeline.", contactId: anna.id, dealId: launch.id });
  await createActivity(userId, workspaceId, { type: "EMAIL", subject: "Sent the proposal", contactId: piotr.id, dealId: app.id });
  await createActivity(userId, workspaceId, { type: "TASK", subject: "Prepare the contract draft", dueAt: ahead(-1), dealId: app.id, ownerId: people.b });
  await createActivity(userId, workspaceId, { type: "MEETING", subject: "Demo for Nordwind", completed: false, dueAt: new Date(Math.floor(Date.now() / DAY) * DAY + 15 * 3_600_000).toISOString(), dealId: app.id, ownerId: people.a });

  // Make the "Mobile app" deal look neglected, and one contact cold, so the heatmap and My Day have something to say.
  await db.deal.update({ where: { nodeId: app.id }, data: { lastActivityAt: ago(25), stageEnteredAt: ago(34) } });
  await db.contact.update({ where: { nodeId: piotr.id }, data: { lastContactedAt: ago(45) } });

  // A small team for the "My team" map: the person's own card, a line of partners at different pace and a newcomer who has not started.
  const partner = async (firstName: string, lastName: string, data: { sponsorId?: string; city: string; since: number; linkedUserId?: string; telegram?: string }) => {
    const c = await createContact(userId, workspaceId, { firstName, lastName, emails: [], phones: [], messengers: data.telegram ? { telegram: data.telegram } : {}, allowDuplicate: true, consentGiven: true });
    await db.contact.update({ where: { nodeId: c.id }, data: { stage: "PARTNER", stageChangedAt: ago(data.since), sponsorId: data.sponsorId ?? null, city: data.city, country: "PL", linkedUserId: data.linkedUserId ?? null } });
    return c.id;
  };
  const work = async (partnerId: string, name: string, days: number[]) => {
    const held = await createContact(userId, workspaceId, { firstName: name, emails: [], phones: [], messengers: {}, allowDuplicate: true, consentGiven: true });
    await db.contact.update({ where: { nodeId: held.id }, data: { heldById: partnerId } });
    // The card was just made, but the work behind it is as old as the days given.
    await db.contactStageEvent.updateMany({ where: { contactNodeId: held.id }, data: { at: ago(Math.min(...days)) } });
    for (const d of days) await db.crmActivity.create({ data: { workspaceId, type: d % 2 ? "CALL" : "MEETING", subject: "Demo", ownerId: userId, contactId: held.id, completedAt: ago(d) } });
  };
  const me = await partner("You", "Leader", { city: "Warsaw", since: 200, linkedUserId: userId });
  const marta = await partner("Marta", "Zielińska", { sponsorId: me, city: "Warsaw", since: 120, telegram: "@marta_z" });
  const oleg = await partner("Oleg", "Koval", { sponsorId: me, city: "Krakow", since: 90 });
  const nina = await partner("Nina", "Wrona", { sponsorId: marta, city: "Warsaw", since: 60 });
  const pavel = await partner("Pavel", "Sidor", { sponsorId: marta, city: "Gdańsk", since: 45 });
  const ola = await partner("Ola", "Maj", { sponsorId: nina, city: "Warsaw", since: 30 });
  await partner("Vika", "Rey", { sponsorId: me, city: "Krakow", since: 12, linkedUserId: people.b });
  await partner("Igor", "Lis", { sponsorId: ola, city: "Warsaw", since: 5 });
  await work(marta, "Contact M1", [1, 2, 3, 4]);
  await work(oleg, "Contact O1", [5, 6]);
  await work(nina, "Contact N1", [1, 3]);
  await work(pavel, "Contact P1", [11]);
  await work(ola, "Contact L1", [2]);

  // A ladder of ranks for the rank tracker: the first is held, the second is the aim.
  const target = new Date(Date.now() + 21 * DAY).toISOString().slice(0, 10);
  await db.workspace.update({
    where: { id: workspaceId },
    data: {
      rankPlan: [
        { id: "r1", name: "Starter", criteria: [{ id: "c1", label: "Clients", target: 3, auto: "clients" }] },
        {
          id: "r2",
          name: "Builder",
          criteria: [
            { id: "c2", label: "Partners in the first line", target: 4, auto: "partnersFirstLine" },
            { id: "c3", label: "People in the line", target: 12, auto: "teamSize" },
            { id: "c4", label: "Group volume", target: 1000, auto: null },
          ],
        },
        { id: "r3", name: "Leader", criteria: [{ id: "c5", label: "People in the line", target: 40, auto: "teamSize" }] },
      ],
    },
  });
  await db.membership.update({ where: { userId_workspaceId: { userId, workspaceId } }, data: { rankState: { currentRankId: "r1", targetDate: target, manual: { c4: { value: 350, at: ago(4).toISOString() } } } } });

  // A few materials for the library, shared by the leader.
  const material = (title: string, kind: string, lang: string, category: string, url: string) =>
    db.material.create({ data: { workspaceId, title, kind, lang, category, url, ownerId: null, shareKey: randomBytes(12).toString("base64url"), createdById: userId } });
  await material("Знакомство с компанией", "VIDEO", "ru", "Знакомство", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await material("Company presentation", "PRESENTATION", "en", "Знакомство", "https://example.com/presentation-en");
  await material("Prezentacja produktu", "PRESENTATION", "pl", "Продукт", "https://example.com/prezentacja-pl");
  await material("Каталог продуктов", "PDF", "ru", "Продукт", "https://example.com/catalog-ru.pdf");

  // Four months of the day plan kept for the history: the numbers climb with the weeks, with the ups and downs of a real working time and a few days off.
  const today = new Date().toISOString().slice(0, 10);
  const scores = Array.from({ length: 120 }, (_, i) => 120 - i).flatMap((back) => {
    const wave = Math.sin(back / 3.2) * 12 + Math.cos(back / 1.7) * 6;
    const eff = Math.max(8, Math.min(100, Math.round(100 - back * 0.45 + wave)));
    const planned = 4 + (back % 4);
    if (back % 7 === 0) return [];
    const done = Math.round((planned * eff) / 100);
    return [{ userId, workspaceId, day: new Date(`${new Date(new Date(`${today}T00:00:00Z`).getTime() - back * DAY).toISOString().slice(0, 10)}T00:00:00Z`), tasksPlanned: Math.ceil(planned / 2), tasksDone: Math.min(Math.ceil(planned / 2), done), meetingsPlanned: Math.floor(planned / 4), meetingsDone: Math.min(Math.floor(planned / 4), Math.round(done / 4)), followUpsPlanned: planned - Math.ceil(planned / 2) - Math.floor(planned / 4), followUpsDone: Math.max(0, Math.min(planned - Math.ceil(planned / 2) - Math.floor(planned / 4), done - Math.ceil(planned / 2))), backlogOpen: back % 5, backlogCleared: back % 3, trackedMinutes: 120 + (back % 6) * 30, efficiency: eff, productivity: Math.max(5, Math.round(eff * 0.85 - (back % 5) * 2)), closed: true }];
  });
  await db.dayScore.createMany({ data: scores });

  if (projectId) {
    await db.nodeLink.create({ data: { fromNodeId: launch.id, toNodeId: projectId, kind: "DEAL_PROJECT" } });
    const project = await db.node.findUniqueOrThrow({ where: { id: projectId }, select: { data: true } });
    await db.node.update({ where: { id: projectId }, data: { data: { ...(project.data as Record<string, unknown>), dealId: launch.id, companyId: brightly.id } as Prisma.InputJsonValue } });
  }

  await createLeadForm(userId, workspaceId, {
    name: "Website contact form",
    pipelineId: pipeline.id,
    enabled: true,
    config: { title: "Tell us about your project", submitLabel: "Send", successMessage: "Thank you! We will reply within one business day.", consentText: "I agree to be contacted about my inquiry.", redirectUrl: null, fields: [{ key: "name", label: "Name", required: true }, { key: "email", label: "Email", required: true }, { key: "company", label: "Company", required: false }, { key: "message", label: "Message", required: false }], allowedOrigins: [], ownerId: people.a, stageId: null },
  });
}
