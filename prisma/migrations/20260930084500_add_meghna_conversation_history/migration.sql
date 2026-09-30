CREATE TABLE "meghna_conversations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "messages" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meghna_conversations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "meghna_conversations_tenant_id_user_id_updated_at_idx"
ON "meghna_conversations"("tenant_id","user_id","updated_at");
