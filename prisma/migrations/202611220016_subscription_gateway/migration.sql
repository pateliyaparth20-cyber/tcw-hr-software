-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "yearlyPrice" INTEGER;

-- CreateTable
CREATE TABLE "billing_checkouts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "request_key" UUID NOT NULL,
    "gateway_revision" UUID NOT NULL,
    "mode" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,
    "plan_name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "tax" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "provider_ref" TEXT,
    "provider_plan_id" TEXT,
    "state" TEXT NOT NULL DEFAULT 'CREATING',
    "mandate_status" TEXT,
    "cancel_scheduled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_charges" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "checkout_id" UUID NOT NULL,
    "provider_payment_id" TEXT NOT NULL,
    "provider_invoice_id" TEXT,
    "invoice_id" UUID,
    "amount" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_gateway_events" (
    "id" UUID NOT NULL,
    "gateway_revision" UUID NOT NULL,
    "event_id" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_gateway_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_checkouts_provider_ref_key" ON "billing_checkouts"("provider_ref");

-- CreateIndex
CREATE INDEX "billing_checkouts_tenant_id_created_at_idx" ON "billing_checkouts"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "billing_checkouts_tenant_id_request_key_key" ON "billing_checkouts"("tenant_id", "request_key");

-- CreateIndex
CREATE UNIQUE INDEX "billing_charges_provider_payment_id_key" ON "billing_charges"("provider_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_charges_provider_invoice_id_key" ON "billing_charges"("provider_invoice_id");

-- CreateIndex
CREATE INDEX "billing_charges_tenant_id_created_at_idx" ON "billing_charges"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "billing_gateway_events_gateway_revision_event_id_key" ON "billing_gateway_events"("gateway_revision", "event_id");
