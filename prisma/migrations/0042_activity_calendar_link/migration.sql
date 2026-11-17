-- A CRM meeting (an activity, not a map node) sent to its owner's Google Calendar: which event in which calendar it became.
-- No foreign key to the activity on purpose: when the meeting is deleted here, the link must outlive it long enough to delete the Google event too.
CREATE TABLE "ActivityCalendarLink" (
    "activityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "etag" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityCalendarLink_pkey" PRIMARY KEY ("activityId")
);

CREATE INDEX "ActivityCalendarLink_userId_workspaceId_idx" ON "ActivityCalendarLink"("userId", "workspaceId");
