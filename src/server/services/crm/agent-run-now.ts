import { runAgent } from "../../../../agent/run";
import type { AgentModel } from "../../../../agent/model";
import { agentRunInput } from "../../../../agent/settings-vars";
import { deliverAgentRun } from "@/server/integrations/telegram-agent";

export type NowRole = "morning_briefing" | "stale_followups" | "evening_report";

export interface RunNowResult {
  output: string;
  tokens: number;
  toolCalls: number;
  /** The result was also sent to the person's Telegram chat. */
  delivered: boolean;
}

/**
 * "Run now": the same run the clock would start, started by the person. A failure is not swallowed: the error goes back to the caller with the model's or the server's own words.
 * The result is sent to the person's Telegram chat when one is linked.
 */
export async function runAgentNow(userId: string, workspaceId: string, role: NowRole, now = new Date(), model?: AgentModel): Promise<RunNowResult> {
  const input = await agentRunInput(userId, workspaceId, now);
  const startedAt = new Date();
  const run = await runAgent({ userId, workspaceId, role, ...input, now, ...(model ? { model } : {}) });
  let delivered = false;
  if (run.tokens > 0) {
    delivered = await deliverAgentRun({ userId, workspaceId, role, output: run.output, since: startedAt })
      .then((r) => r.delivered)
      .catch((e) => (console.error("agent delivery failed", e instanceof Error ? e.message : e), false));
  }
  return { output: run.output, tokens: run.tokens, toolCalls: run.toolCalls.length, delivered };
}
