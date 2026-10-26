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
