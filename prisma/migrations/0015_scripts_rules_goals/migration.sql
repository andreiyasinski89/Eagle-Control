-- CreateTable
CREATE TABLE "Script" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stage" "PersonStage",
    "body" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Script_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "stage" "PersonStage" NOT NULL,
    "nextStep" TEXT NOT NULL,
    "afterDays" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "StageRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkGoal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goals" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetworkGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Script_workspaceId_stage_idx" ON "Script"("workspaceId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "StageRule_workspaceId_stage_key" ON "StageRule"("workspaceId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "NetworkGoal_workspaceId_userId_key" ON "NetworkGoal"("workspaceId", "userId");

-- AddForeignKey
ALTER TABLE "Script" ADD CONSTRAINT "Script_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageRule" ADD CONSTRAINT "StageRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkGoal" ADD CONSTRAINT "NetworkGoal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

