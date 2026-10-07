CREATE TABLE "company_payout_connections" (
 "tenant_id" UUID PRIMARY KEY REFERENCES "tenants"("id") ON DELETE RESTRICT,
 "provider" TEXT NOT NULL DEFAULT 'BANK_FILE', "bank_name" TEXT NOT NULL DEFAULT '',
 "account_label" TEXT NOT NULL DEFAULT '', "account_hint" TEXT NOT NULL DEFAULT '',
 "mode" TEXT NOT NULL DEFAULT 'NEFT', "enabled" BOOLEAN NOT NULL DEFAULT false,
 "credentials_ciphertext" TEXT, "revision" INTEGER NOT NULL DEFAULT 1,
 "updated_by" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "payroll_payment_schedules" (
 "id" UUID PRIMARY KEY, "tenant_id" UUID NOT NULL, "run_id" UUID NOT NULL,
 "scheduled_at" TIMESTAMP(3) NOT NULL, "timezone" TEXT NOT NULL, "mode" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'SCHEDULED', "fingerprint" TEXT NOT NULL,
 "connection_revision" INTEGER NOT NULL, "approved_by" UUID NOT NULL,
 "started_at" TIMESTAMP(3), "finished_at" TIMESTAMP(3), "error" TEXT,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 FOREIGN KEY ("tenant_id", "run_id") REFERENCES "payroll_runs"("tenant_id", "id") ON DELETE RESTRICT
);
CREATE INDEX "payroll_payment_schedules_due" ON "payroll_payment_schedules"("status", "scheduled_at");
CREATE INDEX "payroll_payment_schedules_run" ON "payroll_payment_schedules"("tenant_id", "run_id");
CREATE UNIQUE INDEX "payroll_payment_schedules_one_active" ON "payroll_payment_schedules"("tenant_id", "run_id") WHERE "status" IN ('SCHEDULED', 'RUNNING');

ALTER TABLE "salary_rules" ADD COLUMN "basis" TEXT NOT NULL DEFAULT 'GROSS', ADD COLUMN "calculation" TEXT NOT NULL DEFAULT 'PERCENT', ADD COLUMN "fixed_amount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "wage_cap" INTEGER;
CREATE TABLE "company_payout_connection_versions" (
 "tenant_id" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
 "revision" INTEGER NOT NULL, "provider" TEXT NOT NULL, "bank_name" TEXT NOT NULL,
 "credentials_ciphertext" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("tenant_id", "revision")
);
