ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "ticket_number" TEXT;
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "assigned_to" TEXT;
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "sla_due_at" TIMESTAMP(3);
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMP(3);

UPDATE "support_tickets"
SET "ticket_number" = 'TCW-' || UPPER(SUBSTRING(REPLACE("id"::text, '-', '') FROM 1 FOR 8))
WHERE "ticket_number" IS NULL;

ALTER TABLE "support_tickets" ALTER COLUMN "ticket_number" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "support_tickets_ticket_number_key" ON "support_tickets"("ticket_number");
CREATE INDEX IF NOT EXISTS "support_tickets_status_priority_updated_at_idx" ON "support_tickets"("status", "priority", "updated_at");
