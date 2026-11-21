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
  // One beat for every frequent job: all of them run on the quarter hours (:00 :15 :30 :45), so the database wakes once per beat, not once per job.
  // On the free Neon plan the database sleeps after 5 idle minutes and its awake time is the monthly quota (100 CU-hrs): jobs every 5 minutes kept it awake all month and used the quota up.
  // Keep every job that runs more than once an hour on this beat (a test checks it).
  job("notify/deliver", { cron: "*/15 * * * *" }), // drain the outbox, and on demand
  job("health/refresh", { cron: "0 2 * * *" }), // nightly: health depends on "today"
  job("reminders/dispatch", { cron: "*/15 * * * *" }),
  job("maintenance/run", { cron: "30 3 * * *" }),
  job("crm/temperature", { cron: "40 3 * * *" }),
  job("crm/day-scores", { cron: "50 3 * * *" }),
  job("crm/stale-people", { cron: "0 * * * *" }), // hourly: each person is reminded from 9 o'clock of their own day, once a day
  job("billing/expire", { cron: "15 4 * * *" }),
  // Every 15 minutes: the tick works out per person which roles are due. Failures are handled inside, so the job itself retries once at most.
  job("agent/tick", { cron: "*/15 * * * *", retries: 1 }),
  job("account/erase", { cron: "0 * * * *" }),
  job("demo/reset", { cron: "0 3 * * *" }),
  job("webhooks/deliver", { cron: "*/15 * * * *" }),
  job("api/purge", { cron: "45 3 * * *" }),
  job("calendar/push"),
  job("calendar/push-activity"),
  job("calendar/poll", { cron: "*/30 * * * *" }), // fallback for missed Google notifications, and channel renewal
];
