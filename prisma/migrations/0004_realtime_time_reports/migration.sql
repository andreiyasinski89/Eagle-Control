-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "pendingChannels" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- DropTable

-- CreateTable
CREATE TABLE "NodeStatusEvent" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fromStatus" "NodeStatus",
    "toStatus" "NodeStatus" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,

    CONSTRAINT "NodeStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealStageEvent" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,

    CONSTRAINT "DealStageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunningTimer" (
    "userId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RunningTimer_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "UserIntegration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "kind" "IntegrationKind" NOT NULL,
    "externalId" TEXT,
    "secretEnc" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarLink" (
    "nodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "etag" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarLink_pkey" PRIMARY KEY ("nodeId")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channels" TEXT[],

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId","workspaceId","kind")
);

-- CreateIndex
CREATE INDEX "NodeStatusEvent_projectId_at_idx" ON "NodeStatusEvent"("projectId", "at");

-- CreateIndex
CREATE INDEX "NodeStatusEvent_nodeId_at_idx" ON "NodeStatusEvent"("nodeId", "at");

-- CreateIndex
CREATE INDEX "DealStageEvent_pipelineId_at_idx" ON "DealStageEvent"("pipelineId", "at");

-- CreateIndex
CREATE INDEX "DealStageEvent_workspaceId_at_idx" ON "DealStageEvent"("workspaceId", "at");

-- CreateIndex
CREATE INDEX "UserIntegration_kind_externalId_idx" ON "UserIntegration"("kind", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "UserIntegration_userId_kind_workspaceId_key" ON "UserIntegration"("userId", "kind", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarLink_userId_calendarId_externalId_key" ON "CalendarLink"("userId", "calendarId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "NodeStatusEvent" ADD CONSTRAINT "NodeStatusEvent_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStageEvent" ADD CONSTRAINT "DealStageEvent_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("nodeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunningTimer" ADD CONSTRAINT "RunningTimer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunningTimer" ADD CONSTRAINT "RunningTimer_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIntegration" ADD CONSTRAINT "UserIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIntegration" ADD CONSTRAINT "UserIntegration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarLink" ADD CONSTRAINT "CalendarLink_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarLink" ADD CONSTRAINT "CalendarLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: reconstruct status history from what Phases 2–3 already logged.
-- Creation is recorded as "TODO" (the creation log does not keep the initial status); changes come from the activity log.
INSERT INTO "NodeStatusEvent" ("id", "nodeId", "projectId", "fromStatus", "toStatus", "at")
SELECT 'bf_c_' || n."id", n."id", COALESCE(n."rootId", n."id"), NULL, 'TODO'::"NodeStatus", n."createdAt"
FROM "Node" n
WHERE n."type" IN ('PROJECT', 'EPIC', 'SPRINT', 'TASK', 'SUBTASK');

INSERT INTO "NodeStatusEvent" ("id", "nodeId", "projectId", "fromStatus", "toStatus", "at", "actorId")
SELECT 'bf_s_' || l."id", n."id", COALESCE(n."rootId", n."id"),
       (l."diff" -> 'status' ->> 0)::"NodeStatus", (l."diff" -> 'status' ->> 1)::"NodeStatus", l."createdAt", l."actorId"
FROM "ActivityLog" l
JOIN "Node" n ON n."id" = l."nodeId"
WHERE l."action" = 'node.updated' AND l."diff" ? 'status' AND jsonb_typeof(l."diff" -> 'status') = 'array'
  AND n."type" IN ('PROJECT', 'EPIC', 'SPRINT', 'TASK', 'SUBTASK');

-- Backfill: deals made before stage history existed get one entry into their current stage (the earlier path is not recorded).
INSERT INTO "DealStageEvent" ("id", "dealId", "workspaceId", "pipelineId", "fromStageId", "toStageId", "at")
SELECT 'bf_d_' || d."nodeId", d."nodeId", d."workspaceId", d."pipelineId", NULL, d."stageId", d."stageEnteredAt"
FROM "Deal" d;
