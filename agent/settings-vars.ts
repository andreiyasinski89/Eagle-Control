import { db } from "@/server/db";
import { isValidTimeZone, todayIn } from "@/modules/views/tz";
import { getAgentSettings } from "@/server/services/crm/agent-settings";
import type { RunOptions } from "./run";

/** "2026-11-08" → "08.11.2026" for the prompt; the ISO form goes to the evening report as `deadlineDate`. */
const shown = (iso: string) => iso.split("-").reverse().join(".");

/**
 * What a run needs from the person's settings: the variables of the system and role prompts, and the deadline date.
 * The scheduler (and a person pressing "run") passes this to `runAgent` instead of typing the numbers anywhere.
 */
export async function agentRunInput(userId: string, workspaceId: string, now = new Date()): Promise<Pick<RunOptions, "vars" | "deadlineDate">> {
  const s = await getAgentSettings(userId, workspaceId);
  const me = await db.user.findUnique({ where: { id: userId }, select: { name: true, firstName: true, email: true, timezone: true } });
  const tz = me && isValidTimeZone(me.timezone) ? me.timezone : "UTC";
  const name = me?.firstName?.trim() || me?.name?.trim().split(/\s+/)[0] || me?.email.split("@")[0] || "";
  return {
    vars: { user_name: name, goal: s.goal || "не задана", deadline: s.deadline ? shown(s.deadline) : "не задан", touches_per_day: s.touchesPerDay, meetings_per_day: s.meetingsPerDay, date: todayIn(tz, now) },
    ...(s.deadline ? { deadlineDate: s.deadline } : {}),
  };
}
