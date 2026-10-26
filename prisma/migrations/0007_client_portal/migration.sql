-- AlterTable
ALTER TABLE "Comment" ADD COLUMN "visibleToClient" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Attachment" ADD COLUMN "visibleToClient" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "request" TEXT,
    "note" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Approval_nodeId_status_idx" ON "Approval"("nodeId", "status");

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;
