-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TRIAL',
    "plan" TEXT NOT NULL DEFAULT 'STARTER',
    "employeeLimit" INTEGER NOT NULL DEFAULT 25,
    "expiresAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "profile" JSONB NOT NULL DEFAULT '{}',
    "logo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "permissions" TEXT[],

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roleId" UUID NOT NULL,
    "employeeId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrf" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "key" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "designations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "departmentId" UUID,
    "branchId" UUID,
    "managerId" UUID,
    "designation" TEXT NOT NULL DEFAULT '',
    "employmentType" TEXT NOT NULL DEFAULT 'FULL_TIME',
    "joiningDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "monthlySalary" INTEGER NOT NULL DEFAULT 0,
    "personal" JSONB NOT NULL DEFAULT '{}',
    "deletedAt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "graceMinutes" INTEGER NOT NULL DEFAULT 10,
    "breakMinutes" INTEGER NOT NULL DEFAULT 60,
    "fullDayMinutes" INTEGER NOT NULL DEFAULT 480,
    "halfDayMinutes" INTEGER NOT NULL DEFAULT 240,
    "overtimeAfterMinutes" INTEGER NOT NULL DEFAULT 480,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_devices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "serialNumber" TEXT NOT NULL,
    "branchId" UUID,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "status" TEXT NOT NULL DEFAULT 'UNCONFIGURED',
    "lastSync" TIMESTAMP(3),
    "lastError" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_punches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "deviceId" UUID,
    "sourceId" TEXT NOT NULL,
    "punchTime" TIMESTAMP(3) NOT NULL,
    "punchType" TEXT NOT NULL,
    "verificationType" TEXT NOT NULL DEFAULT 'MANUAL',
    "rawPayload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_punches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_daily" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "firstIn" TIMESTAMP(3),
    "lastOut" TIMESTAMP(3),
    "workMinutes" INTEGER NOT NULL DEFAULT 0,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "annualDays" DECIMAL(5,1) NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "leaveTypeId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "days" DECIMAL(5,1) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "reviewNote" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "endDate" DATE,
    "kind" TEXT NOT NULL DEFAULT 'HR_EVENT',
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalGross" INTEGER NOT NULL DEFAULT 0,
    "totalDeductions" INTEGER NOT NULL DEFAULT 0,
    "totalNet" INTEGER NOT NULL DEFAULT 0,
    "approvedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "employeeName" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "gross" INTEGER NOT NULL,
    "deductions" INTEGER NOT NULL,
    "net" INTEGER NOT NULL,
    "components" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_adjustments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "originalRunId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "targetMonth" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "appliedRunId" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "percent" DECIMAL(6,3) NOT NULL,
    "cap" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "departmentId" UUID,
    "location" TEXT NOT NULL,
    "openings" INTEGER NOT NULL DEFAULT 1,
    "employmentType" TEXT NOT NULL DEFAULT 'FULL_TIME',
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "jobId" UUID NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'APPLIED',
    "notes" TEXT NOT NULL DEFAULT '',
    "interviewAt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "target" INTEGER NOT NULL DEFAULT 100,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "dueDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "trainer" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 20,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "assetTag" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "employeeId" UUID,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "purchaseDate" DATE,
    "value" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_claims" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT NOT NULL DEFAULT '',
    "reviewedBy" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "destination" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "budget" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_exits" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "lastWorkingDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "assetCleared" BOOLEAN NOT NULL DEFAULT false,
    "payrollCleared" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_exits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employeeId" UUID,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "expiresAt" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'PORTAL',
    "eventTime" TIMESTAMP(3) NOT NULL,
    "sourceId" TEXT NOT NULL,
    "app" TEXT,
    "domain" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productivity_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "pattern" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productivity_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "userId" UUID,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyPrice" INTEGER NOT NULL,
    "employeeLimit" INTEGER NOT NULL,
    "deviceLimit" INTEGER NOT NULL,
    "features" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "company" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "stage" TEXT NOT NULL DEFAULT 'LEAD',
    "value" INTEGER NOT NULL DEFAULT 0,
    "nextFollowup" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "dueDate" DATE NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "response" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_code_key" ON "tenants"("code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_tenant_id_userId_idx" ON "sessions"("tenant_id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_tokenHash_key" ON "password_resets"("tokenHash");

-- CreateIndex
CREATE INDEX "password_resets_tenant_id_userId_idx" ON "password_resets"("tenant_id", "userId");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "outbox_sentAt_created_at_idx" ON "outbox"("sentAt", "created_at");

-- CreateIndex
CREATE INDEX "branches_tenant_id_idx" ON "branches"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenant_id_id_key" ON "branches"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenant_id_code_key" ON "branches"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "departments_tenant_id_idx" ON "departments"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_tenant_id_id_key" ON "departments"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_tenant_id_code_key" ON "departments"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "designations_tenant_id_idx" ON "designations"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "designations_tenant_id_id_key" ON "designations"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "designations_tenant_id_code_key" ON "designations"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "teams_tenant_id_idx" ON "teams"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_tenant_id_id_key" ON "teams"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_tenant_id_code_key" ON "teams"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "locations_tenant_id_idx" ON "locations"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "locations_tenant_id_id_key" ON "locations"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "locations_tenant_id_code_key" ON "locations"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "cost_centers_tenant_id_idx" ON "cost_centers"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_tenant_id_id_key" ON "cost_centers"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_tenant_id_code_key" ON "cost_centers"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "employees_tenant_id_idx" ON "employees"("tenant_id");

-- CreateIndex
CREATE INDEX "employees_tenant_id_departmentId_idx" ON "employees"("tenant_id", "departmentId");

-- CreateIndex
CREATE INDEX "employees_tenant_id_status_idx" ON "employees"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenant_id_id_key" ON "employees"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenant_id_employeeCode_key" ON "employees"("tenant_id", "employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenant_id_email_key" ON "employees"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "shifts_tenant_id_idx" ON "shifts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_tenant_id_id_key" ON "shifts"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "attendance_devices_tenant_id_idx" ON "attendance_devices"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_devices_tenant_id_id_key" ON "attendance_devices"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_devices_tenant_id_serialNumber_key" ON "attendance_devices"("tenant_id", "serialNumber");

-- CreateIndex
CREATE INDEX "attendance_punches_tenant_id_idx" ON "attendance_punches"("tenant_id");

-- CreateIndex
CREATE INDEX "attendance_punches_tenant_id_employeeId_punchTime_idx" ON "attendance_punches"("tenant_id", "employeeId", "punchTime");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_punches_tenant_id_id_key" ON "attendance_punches"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_punches_tenant_id_sourceId_key" ON "attendance_punches"("tenant_id", "sourceId");

-- CreateIndex
CREATE INDEX "attendance_daily_tenant_id_idx" ON "attendance_daily"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_daily_tenant_id_id_key" ON "attendance_daily"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_daily_tenant_id_employeeId_date_key" ON "attendance_daily"("tenant_id", "employeeId", "date");

-- CreateIndex
CREATE INDEX "leave_types_tenant_id_idx" ON "leave_types"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_tenant_id_id_key" ON "leave_types"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_tenant_id_name_key" ON "leave_types"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "leave_requests_tenant_id_idx" ON "leave_requests"("tenant_id");

-- CreateIndex
CREATE INDEX "leave_requests_tenant_id_status_startDate_idx" ON "leave_requests"("tenant_id", "status", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "leave_requests_tenant_id_id_key" ON "leave_requests"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "calendar_events_tenant_id_idx" ON "calendar_events"("tenant_id");

-- CreateIndex
CREATE INDEX "calendar_events_tenant_id_date_idx" ON "calendar_events"("tenant_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_events_tenant_id_id_key" ON "calendar_events"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "payroll_runs_tenant_id_idx" ON "payroll_runs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_tenant_id_id_key" ON "payroll_runs"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_tenant_id_month_key" ON "payroll_runs"("tenant_id", "month");

-- CreateIndex
CREATE INDEX "payroll_items_tenant_id_idx" ON "payroll_items"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_items_tenant_id_id_key" ON "payroll_items"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_items_tenant_id_runId_employeeId_key" ON "payroll_items"("tenant_id", "runId", "employeeId");

-- CreateIndex
CREATE INDEX "payroll_adjustments_tenant_id_idx" ON "payroll_adjustments"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_adjustments_tenant_id_id_key" ON "payroll_adjustments"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "salary_rules_tenant_id_idx" ON "salary_rules"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "salary_rules_tenant_id_id_key" ON "salary_rules"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "jobs_tenant_id_idx" ON "jobs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_tenant_id_id_key" ON "jobs"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "candidates_tenant_id_idx" ON "candidates"("tenant_id");

-- CreateIndex
CREATE INDEX "candidates_tenant_id_jobId_stage_idx" ON "candidates"("tenant_id", "jobId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "candidates_tenant_id_id_key" ON "candidates"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "goals_tenant_id_idx" ON "goals"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "goals_tenant_id_id_key" ON "goals"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "courses_tenant_id_idx" ON "courses"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "courses_tenant_id_id_key" ON "courses"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "assets_tenant_id_idx" ON "assets"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "assets_tenant_id_id_key" ON "assets"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "assets_tenant_id_assetTag_key" ON "assets"("tenant_id", "assetTag");

-- CreateIndex
CREATE INDEX "expense_claims_tenant_id_idx" ON "expense_claims"("tenant_id");

-- CreateIndex
CREATE INDEX "expense_claims_tenant_id_status_idx" ON "expense_claims"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "expense_claims_tenant_id_id_key" ON "expense_claims"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "travel_requests_tenant_id_idx" ON "travel_requests"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "travel_requests_tenant_id_id_key" ON "travel_requests"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "employee_exits_tenant_id_idx" ON "employee_exits"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_exits_tenant_id_id_key" ON "employee_exits"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_exits_tenant_id_employeeId_key" ON "employee_exits"("tenant_id", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_documents_objectKey_key" ON "employee_documents"("objectKey");

-- CreateIndex
CREATE INDEX "employee_documents_tenant_id_idx" ON "employee_documents"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_documents_tenant_id_id_key" ON "employee_documents"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "activity_events_tenant_id_idx" ON "activity_events"("tenant_id");

-- CreateIndex
CREATE INDEX "activity_events_tenant_id_employeeId_eventTime_idx" ON "activity_events"("tenant_id", "employeeId", "eventTime");

-- CreateIndex
CREATE UNIQUE INDEX "activity_events_tenant_id_id_key" ON "activity_events"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "activity_events_tenant_id_sourceId_key" ON "activity_events"("tenant_id", "sourceId");

-- CreateIndex
CREATE INDEX "productivity_rules_tenant_id_idx" ON "productivity_rules"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "productivity_rules_tenant_id_id_key" ON "productivity_rules"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "productivity_rules_tenant_id_pattern_key" ON "productivity_rules"("tenant_id", "pattern");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_idx" ON "notifications"("tenant_id");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_userId_readAt_idx" ON "notifications"("tenant_id", "userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_tenant_id_id_key" ON "notifications"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_status_idx" ON "invoices"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");

-- CreateIndex
CREATE INDEX "payments_tenant_id_invoiceId_idx" ON "payments"("tenant_id", "invoiceId");

-- CreateIndex
CREATE INDEX "support_tickets_tenant_id_status_idx" ON "support_tickets"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_tenant_id_runId_fkey" FOREIGN KEY ("tenant_id", "runId") REFERENCES "payroll_runs"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

