-- Why an e-mail was not sent, for the platform owner.
CREATE TABLE "MailFailure" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT,
    "detail" TEXT,
    "toDomain" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailFailure_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MailFailure_at_idx" ON "MailFailure"("at");
