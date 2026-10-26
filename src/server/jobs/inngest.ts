import { Inngest } from "inngest";
import { run, type JobName } from "./index";

export const inngest = new Inngest({ id: "meetowl" });

/** Wraps a handler as an Inngest function: triggered by an event and/or a schedule, retried on failure. */
function job(name: JobName, opts: { cron?: string; retries?: 0 | 1 | 2 | 3 | 4 | 5; concurrency?: number } = {}) {
  const triggers = [{ event: name }, ...(opts.cron ? [{ cron: opts.cron }] : [])];
  return inngest.createFunction(
    { id: name.replace("/", "-"), retries: opts.retries ?? 3, concurrency: { limit: opts.concurrency ?? 1 }, triggers },
    async ({ event, step }) => step.run("run", () => run(name, (event.data ?? {}) as Record<string, unknown>)),
  );
}

export const functions = [
  job("notify/deliver", { cron: "* * * * *" }), // drain the outbox every minute, and on demand
  job("health/refresh", { cron: "0 2 * * *" }), // nightly: health depends on "today"
  job("reminders/dispatch", { cron: "*/5 * * * *" }),
  job("maintenance/run", { cron: "30 3 * * *" }),
  job("billing/expire", { cron: "15 4 * * *" }),
  job("account/erase", { cron: "20 * * * *" }),
  job("demo/reset", { cron: "0 3 * * *" }),
  job("webhooks/deliver", { cron: "* * * * *" }),
  job("api/purge", { cron: "45 3 * * *" }),
  job("calendar/push"),
  job("calendar/poll", { cron: "*/10 * * * *" }), // fallback for missed Google notifications, and channel renewal
];
