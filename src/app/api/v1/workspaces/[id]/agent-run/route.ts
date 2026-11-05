import { z } from "zod";
import { json, parseBody, route } from "@/server/http/handler";
import { runAgentNow } from "@/server/services/crm/agent-run-now";

// A run reads the CRM and writes drafts through many model turns.
export const maxDuration = 300;

const bodySchema = z.object({ role: z.enum(["morning_briefing", "stale_followups", "evening_report"]) });

/** A person starts one of their own agent's roles right now: no clock, no pause after failures. The result (or the exact reason it failed) comes back in the answer. */
export const POST = route<{ id: string }>({ rateLimit: { limit: 6, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await runAgentNow(userId ?? "", params.id, (await parseBody(req, bodySchema)).role)));
