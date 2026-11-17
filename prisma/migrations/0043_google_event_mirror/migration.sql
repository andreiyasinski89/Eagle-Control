-- Events of a connected Google Calendar that were not made in MLM CRM, kept so the person sees their whole day in the MLM CRM calendar.
-- Only the person who connected the calendar sees them; the copy covers about a month back and three months ahead and is replaced at each sync.
CREATE TABLE "GoogleEventCopy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "htmlLink" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleEventCopy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleEventCopy_userId_workspaceId_externalId_key" ON "GoogleEventCopy"("userId", "workspaceId", "externalId");
CREATE INDEX "GoogleEventCopy_userId_workspaceId_startsAt_idx" ON "GoogleEventCopy"("userId", "workspaceId", "startsAt");
