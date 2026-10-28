CREATE TYPE "ContactPrivacy" AS ENUM ('PRIVATE', 'OPEN');
ALTER TABLE "Workspace" ADD COLUMN "contactPrivacy" "ContactPrivacy" NOT NULL DEFAULT 'PRIVATE';
