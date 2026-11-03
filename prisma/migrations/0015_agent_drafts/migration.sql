-- CreateEnum
CREATE TYPE "AgentDraftStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SENT');

-- CreateEnum
CREATE TYPE "AgentDraftChannel" AS ENUM ('TELEGRAM', 'WHATSAPP', 'INSTAGRAM');

-- CreateTable
CREATE TABLE "AgentDraft" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channel" "AgentDraftChannel" NOT NULL,
    "text" TEXT NOT NULL,
    "status" "AgentDraftStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentDraft_workspaceId_userId_status_idx" ON "AgentDraft"("workspaceId", "userId", "status");

-- CreateIndex
CREATE INDEX "AgentDraft_contactId_idx" ON "AgentDraft"("contactId");

-- AddForeignKey
ALTER TABLE "AgentDraft" ADD CONSTRAINT "AgentDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDraft" ADD CONSTRAINT "AgentDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDraft" ADD CONSTRAINT "AgentDraft_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("nodeId") ON DELETE CASCADE ON UPDATE CASCADE;
