-- Denormalised project id so a whole project tree loads with one indexed query.
ALTER TABLE "Node" ADD COLUMN "rootId" TEXT;
CREATE INDEX "Node_rootId_idx" ON "Node"("rootId");
