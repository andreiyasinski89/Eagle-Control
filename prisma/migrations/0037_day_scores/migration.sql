CREATE TABLE "DayScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "tasksPlanned" INTEGER NOT NULL DEFAULT 0,
    "tasksDone" INTEGER NOT NULL DEFAULT 0,
    "meetingsPlanned" INTEGER NOT NULL DEFAULT 0,
    "meetingsDone" INTEGER NOT NULL DEFAULT 0,
    "followUpsPlanned" INTEGER NOT NULL DEFAULT 0,
    "followUpsDone" INTEGER NOT NULL DEFAULT 0,
    "backlogOpen" INTEGER NOT NULL DEFAULT 0,
    "backlogCleared" INTEGER NOT NULL DEFAULT 0,
    "trackedMinutes" INTEGER NOT NULL DEFAULT 0,
    "efficiency" INTEGER,
    "productivity" INTEGER,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayScore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DayScore_userId_workspaceId_day_key" ON "DayScore"("userId", "workspaceId", "day");
CREATE INDEX "DayScore_workspaceId_userId_day_idx" ON "DayScore"("workspaceId", "userId", "day");
ALTER TABLE "DayScore" ADD CONSTRAINT "DayScore_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
