-- CreateEnum
CREATE TYPE "ShareLevel" AS ENUM ('VIEW', 'EDIT');

-- CreateTable
CREATE TABLE "ContactShare" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT,
    "groupId" TEXT,
    "userId" TEXT,
    "teamId" TEXT,
    "level" "ShareLevel" NOT NULL DEFAULT 'VIEW',
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactShare_workspaceId_userId_idx" ON "ContactShare"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "ContactShare_workspaceId_teamId_idx" ON "ContactShare"("workspaceId", "teamId");

-- CreateIndex
CREATE INDEX "ContactShare_contactId_idx" ON "ContactShare"("contactId");

-- CreateIndex
CREATE INDEX "ContactShare_groupId_idx" ON "ContactShare"("groupId");

-- AddForeignKey
ALTER TABLE "ContactShare" ADD CONSTRAINT "ContactShare_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactShare" ADD CONSTRAINT "ContactShare_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("nodeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactShare" ADD CONSTRAINT "ContactShare_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ContactGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactShare" ADD CONSTRAINT "ContactShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactShare" ADD CONSTRAINT "ContactShare_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one object and exactly one grantee
ALTER TABLE "ContactShare" ADD CONSTRAINT "ContactShare_one_object" CHECK (("contactId" IS NOT NULL)::int + ("groupId" IS NOT NULL)::int = 1);
ALTER TABLE "ContactShare" ADD CONSTRAINT "ContactShare_one_grantee" CHECK (("userId" IS NOT NULL)::int + ("teamId" IS NOT NULL)::int = 1);
