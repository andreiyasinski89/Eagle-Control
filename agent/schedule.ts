import { db } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import { cleanAgentSettings } from "@/modules/crm/agent-settings";
import { dueRoles, type ScheduledRole } from "@/modules/crm/agent-schedule";
import { isValidTimeZone, zonedParts, zonedToUtc } from "@/modules/views/tz";
import type { AgentModel } from "./model";
import { runAgent } from "./run";
import { agentRunInput } from "./settings-vars";

const ROLES: ScheduledRole[] = ["morning_briefing", "stale_followups", "evening_report"];
const isFailure = (output: string) => output.startsWith("[error]");

export interface TickResult {
  /** People whose agent is on. */
  people: number;
  runs: { userId: string; role: ScheduledRole; outcome: "ok" | "failed" | "skipped" }[];
}

/**
 * One tick of the clock (every 15 minutes): for everybody whose agent is on, works out which roles are due on their own wall clock
 * and runs them one after another. One person's failure never stops the others: it is on record in agent_runs and tried again
 * at the next tick (up to three times a day). A person without AI on their plan, past the monthly allowance or past their daily limit is skipped.
 */
export async function runDueAgents(now = new Date(), opts: { model?: AgentModel } = {}): Promise<TickResult> {
  const members = await db.membership.findMany({
    where: { role: { not: "GUEST" }, agentSettings: { path: ["enabled"], equals: true } },
    select: { userId: true, workspaceId: true, agentSettings: true, user: { select: { timezone: true } } },
  });
  const result: TickResult = { people: members.length, runs: [] };

  for (const m of members) {
    const settings = cleanAgentSettings(m.agentSettings);
    const tz = isValidTimeZone(m.user.timezone) ? m.user.timezone : "UTC";
    const dayStart = zonedToUtc(zonedParts(now, tz).day, "00:00", tz);
    const recent = await db.agentRun.findMany({
      where: { userId: m.userId, workspaceId: m.workspaceId, role: { in: ROLES }, createdAt: { gte: new Date(now.getTime() - 36 * 3_600_000) } },
      select: { role: true, createdAt: true, output: true },
      orderBy: { createdAt: "asc" },
    });
    const lastOk: Partial<Record<ScheduledRole, Date>> = {};
    const failuresToday: Partial<Record<ScheduledRole, number>> = {};
    for (const r of recent) {
      const role = r.role as ScheduledRole;
      if (isFailure(r.output)) {
        if (r.createdAt >= dayStart) failuresToday[role] = (failuresToday[role] ?? 0) + 1;
      } else lastOk[role] = r.createdAt;
    }

    for (const role of dueRoles({ settings, tz, now, lastOk, failuresToday })) {
      try {
        const input = await agentRunInput(m.userId, m.workspaceId, now);
        await runAgent({ userId: m.userId, workspaceId: m.workspaceId, role, ...input, now, ...(opts.model ? { model: opts.model } : {}) });
        result.runs.push({ userId: m.userId, role, outcome: "ok" });
      } catch (e) {
        // No plan, allowance spent, daily limit reached: nothing to retry and nothing to record.
        if (e instanceof ApiError && (e.status === 402 || e.status === 403 || e.status === 429)) {
          result.runs.push({ userId: m.userId, role, outcome: "skipped" });
          continue;
        }
        const message = e instanceof Error ? e.message : "failed";
        console.error("agent run failed", role, message);
        // runAgent records a failure of the model or a tool itself; one that happened before it started (a prompt, the settings) is recorded here.
        const recorded = await db.agentRun.count({ where: { userId: m.userId, workspaceId: m.workspaceId, role, createdAt: { gte: now } } });
        if (recorded === 0) await db.agentRun.create({ data: { workspaceId: m.workspaceId, userId: m.userId, role, input: "", output: `[error] ${message}`, toolCalls: [], tokens: 0, createdAt: now } });
        result.runs.push({ userId: m.userId, role, outcome: "failed" });
      }
    }
  }
  return result;
}
