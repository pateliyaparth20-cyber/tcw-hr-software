CREATE TABLE IF NOT EXISTS "payroll_payouts" (
  "id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "employee_name" TEXT NOT NULL,
  "employee_code" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "provider" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'IMPS',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "provider_ref" TEXT,
  "utr" TEXT,
  "reference" TEXT NOT NULL,
  "error" TEXT,
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "initiated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_payouts_tenant_run_employee_key" UNIQUE ("tenant_id","run_id","employee_id"),
  CONSTRAINT "payroll_payouts_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_payouts_run_fk" FOREIGN KEY ("tenant_id","run_id") REFERENCES "payroll_runs"("tenant_id","id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_payouts_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "employees"("tenant_id","id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_payout_amount_nonnegative" CHECK ("amount" >= 0)
);
CREATE INDEX IF NOT EXISTS "payroll_payouts_tenant_run_idx" ON "payroll_payouts"("tenant_id","run_id");
CREATE INDEX IF NOT EXISTS "payroll_payouts_tenant_status_idx" ON "payroll_payouts"("tenant_id","status");
