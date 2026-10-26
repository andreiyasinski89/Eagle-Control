import { env } from "@/lib/env";
import { deliverPending } from "@/server/services/notify";
import "@/server/integrations/register";
import { resetDemo } from "@/server/services/demo-mode";
import { runDueErasures } from "@/server/services/account";
import { expireGrace } from "@/server/services/billing";
import { purgeIdempotency } from "@/server/public-api/dispatch";
import { deliverDue, purgeDeliveries } from "@/server/webhooks";
import { pollAll, pushEvent } from "@/server/integrations/google";
import { announceEndedSprints, dispatchReminders, maintenance, refreshAllProjects } from "./tasks";

/** Event name → what it does. Add integration jobs (calendar sync…) here; both runners pick them up. */
export const handlers = {
  "notify/deliver": async () => deliverPending(),
  "health/refresh": async () => ({ ...(await refreshAllProjects()), ...(await announceEndedSprints()) }),
  "reminders/dispatch": async () => dispatchReminders(),
  "maintenance/run": async () => maintenance(),
  /** One Google Calendar event per changed EVENT node; failures are logged, the next change or the poll fixes them. */
  "calendar/push": async (data) => {
    for (const id of Array.isArray(data.nodeIds) ? (data.nodeIds as string[]) : []) await pushEvent(id).catch((e) => console.error("calendar push failed", e instanceof Error ? e.message : e));
  },
  "calendar/poll": async () => pollAll(),
  "billing/expire": async () => expireGrace(),
  "account/erase": async () => runDueErasures(),
  /** Public demo only: puts the sample workspace back as it was. */
  "demo/reset": async () => (env().DEMO_MODE ? resetDemo() : { skipped: true }),
  "webhooks/deliver": async () => deliverDue(),
  "api/purge": async () => ({ idempotency: await purgeIdempotency(), deliveries: await purgeDeliveries() }),
} satisfies Record<string, (data: Record<string, unknown>) => Promise<unknown>>;

export type JobName = keyof typeof handlers;

/** Handlers take no input today; the signature leaves room for jobs that do (e.g. one calendar user). */
export const run = (name: JobName, data: Record<string, unknown> = {}): Promise<unknown> => (handlers[name] as (d: Record<string, unknown>) => Promise<unknown>)(data);

export function jobsMode(): "inline" | "inngest" {
  const e = env();
  return e.JOBS_MODE ?? (e.INNGEST_EVENT_KEY ? "inngest" : "inline");
}

/**
 * Hands work to the background runner. Inline mode runs it right away (development, tests, small
 * single-instance installs); Inngest mode sends an event and returns immediately.
 */
export async function enqueue(name: JobName, data: Record<string, unknown> = {}): Promise<void> {
  if (jobsMode() === "inline") {
    await run(name, data);
    return;
  }
  const { inngest } = await import("./inngest");
  await inngest.send({ name, data });
}
