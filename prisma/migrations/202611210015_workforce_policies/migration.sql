-- AlterTable
ALTER TABLE "attendance_daily" ADD COLUMN     "paid_leave_units" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unpaid_leave_units" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "paid_days" DECIMAL(5,1),
ADD COLUMN     "policy_snapshot" JSONB;

-- CreateTable
CREATE TABLE "workforce_configs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "effective_month" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workforce_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_contracts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "effective_month" TEXT NOT NULL,
    "end_month" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'MONTHLY',
    "amount" INTEGER NOT NULL,
    "template_id" UUID,
    "data" JSONB NOT NULL DEFAULT '{}',
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_pay_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'EARNING',
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "applied_run_id" UUID,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_pay_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_tax_declarations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "financial_year" TEXT NOT NULL,
    "regime" TEXT NOT NULL DEFAULT 'NEW',
    "declared_deduction" INTEGER NOT NULL DEFAULT 0,
    "approved_deduction" INTEGER NOT NULL DEFAULT 0,
    "other_income" INTEGER NOT NULL DEFAULT 0,
    "previous_income" INTEGER NOT NULL DEFAULT 0,
    "previous_tds" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT NOT NULL DEFAULT '',
    "reviewer_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_tax_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_policy_debits" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "days" DECIMAL(6,2) NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "leave_policy_debits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workforce_configs_tenant_id_kind_effective_month_created_at_idx" ON "workforce_configs"("tenant_id", "kind", "effective_month", "created_at");

-- CreateIndex
CREATE INDEX "salary_contracts_tenant_id_employee_id_effective_month_idx" ON "salary_contracts"("tenant_id", "employee_id", "effective_month");

-- CreateIndex
CREATE INDEX "payroll_pay_items_tenant_id_month_employee_id_idx" ON "payroll_pay_items"("tenant_id", "month", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_tax_declarations_tenant_id_employee_id_financial_y_key" ON "employee_tax_declarations"("tenant_id", "employee_id", "financial_year");

-- CreateIndex
CREATE INDEX "leave_policy_debits_tenant_id_employee_id_leave_type_id_yea_idx" ON "leave_policy_debits"("tenant_id", "employee_id", "leave_type_id", "year");

-- CreateIndex
CREATE INDEX "leave_policy_debits_tenant_id_run_id_idx" ON "leave_policy_debits"("tenant_id", "run_id");

