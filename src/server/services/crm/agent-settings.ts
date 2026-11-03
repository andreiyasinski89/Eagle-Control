import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { AGENT_LIMITS, cleanAgentSettings, type AgentSettings } from "@/modules/crm/agent-settings";
import { forbidden } from "@/server/http/errors";
import { loadWorkspaceMember } from "@/server/services/nodes/access";

export const agentSettingsSchema = z.object({
  enabled: z.boolean(),
  briefingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  touchesPerDay: z.number().int().min(AGENT_LIMITS.touchesPerDay[0]).max(AGENT_LIMITS.touchesPerDay[1]),
  meetingsPerDay: z.number().int().min(AGENT_LIMITS.meetingsPerDay[0]).max(AGENT_LIMITS.meetingsPerDay[1]),
  goal: z.string().trim().max(AGENT_LIMITS.goal),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  dailyRunLimit: z.number().int().min(AGENT_LIMITS.dailyRunLimit[0]).max(AGENT_LIMITS.dailyRunLimit[1]),
});

/** Settings belong to one person in one workspace: nobody reads or changes a colleague's. Clients (guests) have no agent. */
async function ownMembership(userId: string, workspaceId: string) {
  const m = await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  if (m.role === "GUEST") throw forbidden();
  return m;
}

export async function getAgentSettings(userId: string, workspaceId: string): Promise<AgentSettings> {
  return cleanAgentSettings((await ownMembership(userId, workspaceId)).agentSettings);
}

export async function saveAgentSettings(userId: string, workspaceId: string, input: z.infer<typeof agentSettingsSchema>): Promise<AgentSettings> {
  await ownMembership(userId, workspaceId);
  const settings = cleanAgentSettings(input);
  await db.membership.update({ where: { userId_workspaceId: { userId, workspaceId } }, data: { agentSettings: settings as unknown as Prisma.InputJsonValue } });
  return settings;
}
