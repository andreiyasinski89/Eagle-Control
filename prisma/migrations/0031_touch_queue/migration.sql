ALTER TABLE "Contact" ADD COLUMN "city" TEXT;
ALTER TABLE "Contact" ADD COLUMN "returnAt" TIMESTAMP(3);
CREATE INDEX "Contact_workspaceId_returnAt_idx" ON "Contact"("workspaceId", "returnAt");
ALTER TABLE "Script" ADD COLUMN "situation" TEXT;
ALTER TABLE "Script" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "Script_workspaceId_ownerId_idx" ON "Script"("workspaceId", "ownerId");
ALTER TABLE "Membership" ADD COLUMN "touchSettings" JSONB;
