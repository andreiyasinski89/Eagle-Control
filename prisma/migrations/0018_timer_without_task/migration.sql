-- Time can be spent without a task: the task becomes optional, a label says what the time was for,
-- and the workspace is kept on the row itself. Rows that already exist get their workspace from their task.

ALTER TABLE "TimeEntry" ADD COLUMN "label" TEXT, ADD COLUMN "workspaceId" TEXT;
UPDATE "TimeEntry" t SET "workspaceId" = n."workspaceId" FROM "Node" n WHERE n."id" = t."nodeId";
ALTER TABLE "TimeEntry" ALTER COLUMN "workspaceId" SET NOT NULL, ALTER COLUMN "nodeId" DROP NOT NULL;

ALTER TABLE "RunningTimer" ADD COLUMN "label" TEXT, ADD COLUMN "workspaceId" TEXT;
UPDATE "RunningTimer" r SET "workspaceId" = n."workspaceId" FROM "Node" n WHERE n."id" = r."nodeId";
ALTER TABLE "RunningTimer" ALTER COLUMN "workspaceId" SET NOT NULL, ALTER COLUMN "nodeId" DROP NOT NULL;

CREATE INDEX "TimeEntry_workspaceId_userId_date_idx" ON "TimeEntry"("workspaceId", "userId", "date");

ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunningTimer" ADD CONSTRAINT "RunningTimer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
