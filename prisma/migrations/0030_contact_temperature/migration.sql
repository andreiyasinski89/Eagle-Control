ALTER TABLE "Contact" ADD COLUMN "temperatureManualUntil" TIMESTAMP(3);
ALTER TABLE "CrmActivity" ADD COLUMN "outcome" TEXT;
ALTER TABLE "CrmActivity" ADD COLUMN "signals" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "Contact_workspaceId_temperature_idx" ON "Contact"("workspaceId", "temperature");
