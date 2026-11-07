-- Team access: free Pro for the platform owner's own network. NULL = decided by the chain of invitations (see modules/plans/team-access.ts),
-- 'ON' / 'OFF' = set by the platform owner by hand for this person (and, unless set otherwise lower down, for the people they brought).
ALTER TABLE "User" ADD COLUMN "teamAccess" TEXT;
ALTER TABLE "User" ADD COLUMN "teamAccessAt" TIMESTAMP(3);
