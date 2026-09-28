CREATE TABLE IF NOT EXISTS "platform_ai_config" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "provider" TEXT NOT NULL DEFAULT 'OPENAI_COMPATIBLE',
  "base_url" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "api_key_ciphertext" TEXT,
  "api_key_hint" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_ai_config_pkey" PRIMARY KEY ("id")
);
