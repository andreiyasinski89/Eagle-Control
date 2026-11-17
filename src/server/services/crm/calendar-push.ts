/**
 * Hands changed CRM meetings to the Google Calendar sync after the change is saved, without making the person wait for Google or fail because of it.
 * Whatever does not get through is picked up by the regular poll (see catchUpMeetings in integrations/google).
 */
export function pushMeetingsSoon(activityIds: string[]): void {
  if (!activityIds.length) return;
  void import("@/server/jobs").then((m) => m.enqueue("calendar/push-activity", { activityIds })).catch((e) => console.error("meeting push not queued", e instanceof Error ? e.message : e));
}
