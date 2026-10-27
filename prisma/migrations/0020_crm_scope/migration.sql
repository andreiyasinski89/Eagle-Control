-- CreateEnum
CREATE TYPE "CrmScope" AS ENUM ('OWN', 'TEAM', 'ALL');

-- AlterTable
ALTER TABLE "Membership" ADD COLUMN "crmScope" "CrmScope" NOT NULL DEFAULT 'ALL';

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN "crmScope" "CrmScope" NOT NULL DEFAULT 'ALL';
