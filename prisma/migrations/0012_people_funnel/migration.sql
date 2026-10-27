-- CreateEnum
CREATE TYPE "PersonStage" AS ENUM ('NEW', 'FIRST_CONTACT', 'WARMING', 'PRESENTATION', 'DECIDING', 'CLIENT', 'PARTNER', 'DECLINED', 'NO_REPLY');

-- CreateEnum
CREATE TYPE "Temperature" AS ENUM ('HOT', 'WARM', 'COLD');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "country" TEXT,
ADD COLUMN     "influence" INTEGER,
ADD COLUMN     "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "nextStep" TEXT,
ADD COLUMN     "nextStepAt" TIMESTAMP(3),
ADD COLUMN     "source" TEXT,
ADD COLUMN     "sponsorName" TEXT,
ADD COLUMN     "stage" "PersonStage" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "temperature" "Temperature",
ADD COLUMN     "typeTag" TEXT;

-- CreateTable
CREATE TABLE "ContactStageEvent" (
    "id" TEXT NOT NULL,
    "contactNodeId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fromStage" "PersonStage",
    "toStage" "PersonStage" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,

    CONSTRAINT "ContactStageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactStageEvent_contactNodeId_at_idx" ON "ContactStageEvent"("contactNodeId", "at");

-- CreateIndex
CREATE INDEX "ContactStageEvent_workspaceId_at_idx" ON "ContactStageEvent"("workspaceId", "at");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_stage_idx" ON "Contact"("workspaceId", "stage");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_nextStepAt_idx" ON "Contact"("workspaceId", "nextStepAt");

-- AddForeignKey
ALTER TABLE "ContactStageEvent" ADD CONSTRAINT "ContactStageEvent_contactNodeId_fkey" FOREIGN KEY ("contactNodeId") REFERENCES "Contact"("nodeId") ON DELETE CASCADE ON UPDATE CASCADE;

