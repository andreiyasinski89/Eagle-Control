CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "category" TEXT,
    "url" TEXT,
    "fileKey" TEXT,
    "fileName" TEXT,
    "mime" TEXT,
    "size" INTEGER,
    "qr" JSONB,
    "ownerId" TEXT,
    "shareKey" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Material_shareKey_key" ON "Material"("shareKey");
CREATE INDEX "Material_workspaceId_ownerId_idx" ON "Material"("workspaceId", "ownerId");
ALTER TABLE "Material" ADD CONSTRAINT "Material_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
