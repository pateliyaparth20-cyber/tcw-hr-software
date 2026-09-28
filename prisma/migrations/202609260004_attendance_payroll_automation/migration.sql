ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "shift_id" UUID;
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "early_out_grace_minutes" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "working_days" TEXT NOT NULL DEFAULT '1,2,3,4,5';

ALTER TABLE "attendance_daily" ADD COLUMN IF NOT EXISTS "shift_id" UUID;
ALTER TABLE "attendance_daily" ADD COLUMN IF NOT EXISTS "scheduled_minutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "attendance_daily" ADD COLUMN IF NOT EXISTS "early_out_minutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "attendance_daily" ADD COLUMN IF NOT EXISTS "payable_units" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "attendance_daily" ADD COLUMN IF NOT EXISTS "leave_units" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "attendance_daily" ADD COLUMN IF NOT EXISTS "day_type" TEXT NOT NULL DEFAULT 'WORKING';
ALTER TABLE "attendance_daily" ADD COLUMN IF NOT EXISTS "exception_code" TEXT NOT NULL DEFAULT '';
ALTER TABLE "attendance_daily" ADD COLUMN IF NOT EXISTS "correction_note" TEXT NOT NULL DEFAULT '';
ALTER TABLE "attendance_daily" ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS "attendance_daily_tenant_id_date_status_idx" ON "attendance_daily"("tenant_id", "date", "status");

CREATE TABLE IF NOT EXISTS "attendance_period_locks" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "month" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'LOCKED',
  "locked_by" TEXT,
  "locked_at" TIMESTAMPTZ,
  "unlocked_by" TEXT,
  "unlocked_at" TIMESTAMPTZ,
  "summary" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_period_locks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_period_locks_tenant_id_month_key" ON "attendance_period_locks"("tenant_id", "month");
CREATE INDEX IF NOT EXISTS "attendance_period_locks_tenant_id_status_idx" ON "attendance_period_locks"("tenant_id", "status");

ALTER TABLE "payroll_runs" ADD COLUMN IF NOT EXISTS "attendance_lock_id" UUID;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "scheduled_days" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "payable_units" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "present_days" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "half_days" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "paid_leave_units" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "unpaid_leave_units" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "absent_days" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "late_minutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payroll_items" ADD COLUMN IF NOT EXISTS "overtime_minutes" INTEGER NOT NULL DEFAULT 0;
