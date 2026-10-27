-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "heldById" TEXT,
ADD COLUMN     "linkedUserId" TEXT,
ADD COLUMN     "sponsorId" TEXT;

-- CreateTable
CREATE TABLE "ContactTransfer" (
    "id" TEXT NOT NULL,
    "contactNodeId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fromHeldId" TEXT,
    "toHeldId" TEXT,
    "fromOwnerId" TEXT,
    "toOwnerId" TEXT,
    "note" TEXT,
    "actorId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactTransfer_contactNodeId_at_idx" ON "ContactTransfer"("contactNodeId", "at");

-- CreateIndex
CREATE INDEX "ContactTransfer_workspaceId_at_idx" ON "ContactTransfer"("workspaceId", "at");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_sponsorId_idx" ON "Contact"("workspaceId", "sponsorId");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_heldById_idx" ON "Contact"("workspaceId", "heldById");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "Contact"("nodeId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_heldById_fkey" FOREIGN KEY ("heldById") REFERENCES "Contact"("nodeId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactTransfer" ADD CONSTRAINT "ContactTransfer_contactNodeId_fkey" FOREIGN KEY ("contactNodeId") REFERENCES "Contact"("nodeId") ON DELETE CASCADE ON UPDATE CASCADE;

