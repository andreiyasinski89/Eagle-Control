import { afterResponse } from "@/server/jobs/after-response";

/**
 * Hands changed CRM meetings to the Google Calendar sync after the change is saved, without making the person wait for Google or fail because of it.
 * The work is kept alive until it is done (see afterResponse). Whatever still does not get through is picked up by the regular poll
 * (see catchUpMeetings in integrations/google), which Vercel Cron runs once an hour, at the same minute as the other hourly job so the free database is not woken more often for it.
 */
export function pushMeetingsSoon(activityIds: string[]): void {
  if (!activityIds.length) return;
  afterResponse(() => import("@/server/jobs").then((m) => m.enqueue("calendar/push-activity", { activityIds })).catch((e) => console.error("meeting push not queued", e instanceof Error ? e.message : e)));
}
