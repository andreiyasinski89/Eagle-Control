-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "basePlan" "Plan" NOT NULL DEFAULT 'FREE',
ADD COLUMN "trialEndsAt" TIMESTAMP(3),
ADD COLUMN "bonusUntil" TIMESTAMP(3),
ADD COLUMN "giftUntil" TIMESTAMP(3);

-- What every workspace has now is lasting: it came from Stripe, the list of addresses or the administrator.
UPDATE "Workspace" SET "basePlan" = "plan";
