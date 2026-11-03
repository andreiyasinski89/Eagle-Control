import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { db } from "@/server/db";
import { notFound } from "@/server/http/errors";
import { createAgentDraft, createDraftSchema } from "@/server/services/crm/agent-drafts";
import { activitySchema, createActivity, listActivities, listActivitiesSchema } from "@/server/services/crm/activities";
import { getContact, listContacts, listContactsSchema } from "@/server/services/crm/contacts";
import { dealFieldsSchema, moveDeal, moveDealSchema, patchDealSchema, updateDeal } from "@/server/services/crm/deals";
import { getMyDay } from "@/server/services/crm/my-day";
import { calendarQuerySchema, workspaceCalendar } from "@/server/services/nodes/views";
import type { ToolDef } from "./model";

/** Everything the agent writes into the CRM carries this in `source`. */
export const AGENT_SOURCE = "agent";
export const AGENT_PREFIX = "[агент]";

export interface AgentContext {
  userId: string;
  workspaceId: string;
}

export interface AgentTool {
  name: string;
  description: string;
  readOnly: boolean;
  schema: z.ZodTypeAny;
  run(ctx: AgentContext, args: never): Promise<unknown>;
}

function tool<S extends z.ZodTypeAny>(t: { name: string; description: string; readOnly: boolean; schema: S; run(ctx: AgentContext, args: z.infer<S>): Promise<unknown> }): AgentTool {
  return t as unknown as AgentTool;
}

/** The agent may only touch ids of its own workspace, like the public API's `inWorkspace`. */
async function inWorkspace(ctx: AgentContext, nodeId: string): Promise<void> {
  const n = await db.node.findUnique({ where: { id: nodeId }, select: { workspaceId: true } });
  if (!n || n.workspaceId !== ctx.workspaceId) throw notFound("resource");
}

const withPrefix = (subject: string) => (subject.startsWith(AGENT_PREFIX) ? subject : `${AGENT_PREFIX} ${subject}`);

/** Every CRM change by the agent leaves a NOTE behind, whether or not the model remembered to write one (rule 5). */
async function logChange(ctx: AgentContext, dealId: string, subject: string, body: string) {
  await createActivity(ctx.userId, ctx.workspaceId, { type: "NOTE", subject: withPrefix(subject), body, dealId }, { source: AGENT_SOURCE });
}

const dealPatchSchema = dealFieldsSchema.omit({ source: true }).partial().extend({ id: z.string().describe("Deal id") });

export const AGENT_TOOLS: AgentTool[] = [
  tool({
    name: "my_day",
    description: "The connected person's day: what is due, meetings, follow-ups and what needs attention.",
    readOnly: true,
    schema: z.object({}),
    run: (ctx) => getMyDay(ctx.userId, ctx.workspaceId),
  }),
  tool({
    name: "get_calendar",
    description: "Everything dated in a window of up to two months: task deadlines, events, CRM follow-ups and deal dates. Times are UTC. `mine=1` limits it to the connected person.",
    readOnly: true,
    schema: calendarQuerySchema,
    run: (ctx, q) => workspaceCalendar(ctx.userId, ctx.workspaceId, q),
  }),
  tool({
    name: "list_contacts",
    description: "CRM contacts with stage, temperature, consentGiven, messengers and next step; `q` searches names and e-mails. Filter by stage, temperature or `noTouchDays`.",
    readOnly: true,
    schema: listContactsSchema,
    run: (ctx, f) => listContacts(ctx.userId, ctx.workspaceId, f),
  }),
  tool({
    name: "get_contact",
    description: "One CRM contact.",
    readOnly: true,
    schema: z.object({ id: z.string().describe("Contact id (from list_contacts)") }),
    run: async (ctx, { id }) => (await inWorkspace(ctx, id), getContact(ctx.userId, id)),
  }),
  tool({
    name: "list_activities",
    description: "Calls, meetings, messages, notes and follow-ups logged in the CRM, newest first. Pass `contactId` for one person's history.",
    readOnly: true,
    schema: listActivitiesSchema,
    run: (ctx, f) => listActivities(ctx.userId, ctx.workspaceId, f),
  }),
  tool({
    name: "log_activity",
    description: `Log an activity on a contact, company or deal. The subject is prefixed with "${AGENT_PREFIX}" and the row is marked source="${AGENT_SOURCE}". This records, it never sends anything to anyone.`,
    readOnly: false,
    schema: activitySchema,
    run: async (ctx, a) => {
      for (const id of [a.contactId, a.companyId, a.dealId]) if (id) await inWorkspace(ctx, id);
      return createActivity(ctx.userId, ctx.workspaceId, { ...a, subject: withPrefix(a.subject) }, { source: AGENT_SOURCE });
    },
  }),
  tool({
    name: "create_draft",
    description:
      "Save a message draft for a contact; a person reads it in the \"Черновики агента\" panel and sends it themselves. This never sends anything. " +
      "If the contact has consentGiven = false no draft is made: an open task \"получить согласие\" is created instead and the result says consent_required — then suggest a first personal message without selling.",
    readOnly: false,
    schema: createDraftSchema,
    run: async (ctx, input) => {
      await inWorkspace(ctx, input.contactId);
      const r = await createAgentDraft(ctx.userId, ctx.workspaceId, input);
      return r.kind === "draft" ? { status: "draft_created", draftId: r.draft.id } : { status: "consent_required", consentTaskId: r.taskId, taskCreated: r.created };
    },
  }),
  tool({
    name: "move_deal",
    description: `Move a deal to another stage of its pipeline (marked source="${AGENT_SOURCE}"; a ${AGENT_PREFIX} NOTE is logged automatically). Moving to a lost stage needs lostReasonId.`,
    readOnly: false,
    schema: z.object({ id: z.string().describe("Deal id") }).merge(moveDealSchema),
    run: async (ctx, { id, ...input }) => {
      await inWorkspace(ctx, id);
      const moved = await moveDeal(ctx.userId, id, input, { source: AGENT_SOURCE });
      await logChange(ctx, id, "Сделка перемещена", `Новая стадия: ${input.stageId}`);
      return moved;
    },
  }),
  tool({
    name: "update_deal",
    description: `Change only the fields you send on a deal (amount, nextStep, nextStepAt, …). A ${AGENT_PREFIX} NOTE with the changed fields is logged automatically. The lead source of the deal cannot be changed here.`,
    readOnly: false,
    schema: dealPatchSchema,
    run: async (ctx, { id, ...rest }) => {
      await inWorkspace(ctx, id);
      const patch = patchDealSchema.parse(rest);
      const updated = await updateDeal(ctx.userId, id, patch);
      await logChange(ctx, id, "Сделка обновлена", `Изменено: ${JSON.stringify(patch)}`);
      return updated;
    },
  }),
];

export const toolByName = new Map(AGENT_TOOLS.map((t) => [t.name, t]));

export function toolDefs(): ToolDef[] {
  return AGENT_TOOLS.map((t) => {
    const schema = zodToJsonSchema(t.schema, { target: "jsonSchema7", $refStrategy: "none" }) as Record<string, unknown>;
    delete schema.$schema;
    return { name: t.name, description: t.description, input_schema: { type: "object", ...schema } };
  });
}
