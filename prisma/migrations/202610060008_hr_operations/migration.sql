-- CreateTable
CREATE TABLE "salary_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "effective_month" TEXT NOT NULL,
    "basic" INTEGER NOT NULL,
    "hra" INTEGER NOT NULL DEFAULT 0,
    "allowances" INTEGER NOT NULL DEFAULT 0,
    "overtime_hourly" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_loans" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "principal" INTEGER NOT NULL,
    "installment" INTEGER NOT NULL,
    "start_month" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_installments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "applied_run_id" UUID,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_policies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "resource" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'SINGLE',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "resource" TEXT NOT NULL,
    "request_id" UUID NOT NULL,
    "manager_employee_id" UUID,
    "stage" TEXT NOT NULL DEFAULT 'MANAGER',
    "manager_reviewer_id" UUID,
    "manager_note" TEXT NOT NULL DEFAULT '',
    "manager_reviewed_at" TIMESTAMP(3),
    "final_reviewer_id" UUID,
    "final_note" TEXT NOT NULL DEFAULT '',
    "final_reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_enrollments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ENROLLED',
    "score" INTEGER,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "asset_tag" TEXT NOT NULL,
    "employee_id" UUID,
    "employee_name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_tasks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'JOINING',
    "title" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_by" UUID,
    "completed_at" TIMESTAMP(3),
    "due_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "salary_versions_tenant_id_employee_id_effective_month_idx" ON "salary_versions"("tenant_id", "employee_id", "effective_month");

-- CreateIndex
CREATE INDEX "salary_versions_tenant_id_employee_id_idx" ON "salary_versions"("tenant_id", "employee_id");

-- CreateIndex
CREATE INDEX "payroll_loans_tenant_id_employee_id_idx" ON "payroll_loans"("tenant_id", "employee_id");

-- CreateIndex
CREATE INDEX "loan_installments_tenant_id_month_idx" ON "loan_installments"("tenant_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "loan_installments_tenant_id_loan_id_month_key" ON "loan_installments"("tenant_id", "loan_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "approval_policies_tenant_id_resource_key" ON "approval_policies"("tenant_id", "resource");

-- CreateIndex
CREATE INDEX "approval_requests_tenant_id_stage_idx" ON "approval_requests"("tenant_id", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_tenant_id_resource_request_id_key" ON "approval_requests"("tenant_id", "resource", "request_id");

-- CreateIndex
CREATE INDEX "course_enrollments_tenant_id_employee_id_idx" ON "course_enrollments"("tenant_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "course_enrollments_tenant_id_course_id_employee_id_key" ON "course_enrollments"("tenant_id", "course_id", "employee_id");

-- CreateIndex
CREATE INDEX "asset_events_tenant_id_asset_id_created_at_idx" ON "asset_events"("tenant_id", "asset_id", "created_at");

-- CreateIndex
CREATE INDEX "employee_tasks_tenant_id_employee_id_idx" ON "employee_tasks"("tenant_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_tasks_tenant_id_employee_id_kind_title_key" ON "employee_tasks"("tenant_id", "employee_id", "kind", "title");

