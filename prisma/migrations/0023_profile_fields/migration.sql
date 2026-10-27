-- AlterTable
ALTER TABLE "User" ADD COLUMN "firstName" TEXT,
ADD COLUMN "lastName" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "telegram" TEXT;

-- The names people already have, split at the first space.
UPDATE "User"
SET "firstName" = NULLIF(split_part(trim("name"), ' ', 1), ''),
    "lastName" = NULLIF(trim(substr(trim("name"), length(split_part(trim("name"), ' ', 1)) + 1)), '')
WHERE "name" IS NOT NULL AND trim("name") <> '';
