CREATE TABLE "support_ticket_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "ticket_id" UUID NOT NULL,
  "author_id" UUID,
  "author_scope" TEXT NOT NULL,
  "author_name" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "internal" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "support_ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "support_ticket_messages_tenant_id_ticket_id_created_at_idx" ON "support_ticket_messages"("tenant_id", "ticket_id", "created_at");

INSERT INTO "support_ticket_messages" ("tenant_id","ticket_id","author_scope","author_name","message","internal","created_at")
SELECT "tenant_id","id",'TENANT','Company requester',"message",false,"created_at" FROM "support_tickets";

INSERT INTO "support_ticket_messages" ("tenant_id","ticket_id","author_scope","author_name","message","internal","created_at")
SELECT "tenant_id","id",'PLATFORM',COALESCE("assigned_to",'TCW Support'),"response",false,"updated_at" FROM "support_tickets" WHERE "response" IS NOT NULL AND length(trim("response")) > 0;
