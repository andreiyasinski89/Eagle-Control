-- AlterTable
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SignInAttempt" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "mailHash" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignInAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignInAttempt_at_idx" ON "SignInAttempt"("at");

-- CreateIndex
CREATE INDEX "SignInAttempt_ipHash_at_idx" ON "SignInAttempt"("ipHash", "at");

-- CreateIndex
CREATE INDEX "SignInAttempt_mailHash_at_idx" ON "SignInAttempt"("mailHash", "at");
