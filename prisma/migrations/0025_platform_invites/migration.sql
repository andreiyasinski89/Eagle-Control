-- AlterTable
ALTER TABLE "User" ADD COLUMN "inviteCode" TEXT,
ADD COLUMN "referredById" TEXT,
ADD COLUMN "referredAt" TIMESTAMP(3),
ADD COLUMN "suspendedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SignupIntent" ADD COLUMN "inviteCode" TEXT;

-- CreateTable
CREATE TABLE "BonusPoint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BonusPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetUserId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_inviteCode_key" ON "User"("inviteCode");

-- CreateIndex
CREATE INDEX "BonusPoint_userId_idx" ON "BonusPoint"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BonusPoint_userId_reason_refUserId_key" ON "BonusPoint"("userId", "reason", "refUserId");

-- CreateIndex
CREATE INDEX "AdminLog_at_idx" ON "AdminLog"("at");

-- CreateIndex
CREATE INDEX "AdminLog_targetUserId_idx" ON "AdminLog"("targetUserId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusPoint" ADD CONSTRAINT "BonusPoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
