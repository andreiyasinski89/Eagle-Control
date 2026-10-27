-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "groupId" TEXT;

-- CreateTable
CREATE TABLE "ContactGroup" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactGroup_workspaceId_parentId_idx" ON "ContactGroup"("workspaceId", "parentId");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_groupId_idx" ON "Contact"("workspaceId", "groupId");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ContactGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactGroup" ADD CONSTRAINT "ContactGroup_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactGroup" ADD CONSTRAINT "ContactGroup_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ContactGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

