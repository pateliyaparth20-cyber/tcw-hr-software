-- CreateTable
CREATE TABLE "user_security" (
    "user_id" UUID NOT NULL,
    "secret" TEXT,
    "pending_secret" TEXT,
    "pending_expires_at" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_counter" INTEGER NOT NULL DEFAULT -1,
    "recovery_hashes" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_security_pkey" PRIMARY KEY ("user_id")
);

