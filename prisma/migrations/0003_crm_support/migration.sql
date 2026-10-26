-- Denormalised workspace ids so CRM lists and filters need no join through Node.
ALTER TABLE "Company" ADD COLUMN "workspaceId" TEXT NOT NULL, ADD COLUMN "domain" TEXT;
CREATE INDEX "Company_workspaceId_domain_idx" ON "Company"("workspaceId", "domain");

ALTER TABLE "Contact" ADD COLUMN "workspaceId" TEXT NOT NULL, ADD COLUMN "phonesNorm" TEXT[];
CREATE INDEX "Contact_workspaceId_idx" ON "Contact"("workspaceId");
CREATE INDEX "Contact_phonesNorm_idx" ON "Contact" USING GIN ("phonesNorm");

ALTER TABLE "Deal" ADD COLUMN "workspaceId" TEXT NOT NULL, ADD COLUMN "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "Deal_workspaceId_ownerId_idx" ON "Deal"("workspaceId", "ownerId");

CREATE TABLE "LeadIngest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "payload" JSONB NOT NULL,
    "ipHash" TEXT,
    "status" TEXT NOT NULL,
    "contactId" TEXT,
    "dealId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadIngest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LeadIngest_workspaceId_idempotencyKey_key" ON "LeadIngest"("workspaceId", "idempotencyKey");
CREATE INDEX "LeadIngest_workspaceId_createdAt_idx" ON "LeadIngest"("workspaceId", "createdAt");
