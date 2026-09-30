ALTER TABLE "leave_requests"
  ADD COLUMN IF NOT EXISTS "request_key" TEXT;

-- Keep one active leave for an exact employee/date range if earlier UI retries created duplicates.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "tenant_id", "employeeId", "startDate", "endDate"
      ORDER BY "created_at" ASC, "id" ASC
    ) AS rn
  FROM "leave_requests"
  WHERE "status" IN ('PENDING','APPROVED')
)
DELETE FROM "leave_requests" lr
USING ranked r
WHERE lr."id" = r."id"
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "leave_requests_tenant_id_request_key_key"
  ON "leave_requests"("tenant_id","request_key")
  WHERE "request_key" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "leave_requests_one_active_exact_range"
  ON "leave_requests"("tenant_id","employeeId","startDate","endDate")
  WHERE "status" IN ('PENDING','APPROVED');

-- Permanently clear employees that had already been archived by the old delete flow.
CREATE TEMP TABLE "_tcw_deleted_employees" ON COMMIT DROP AS
SELECT "id","tenant_id"
FROM "employees"
WHERE "deletedAt" IS NOT NULL;

CREATE TEMP TABLE "_tcw_deleted_employee_users" ON COMMIT DROP AS
SELECT u."id",u."tenant_id"
FROM "users" u
JOIN "_tcw_deleted_employees" d
  ON u."tenant_id" = d."tenant_id"
 AND u."employeeId" = d."id";

DELETE FROM "push_subscriptions" p
USING "_tcw_deleted_employee_users" u
WHERE p."user_id" = u."id";

DELETE FROM "password_resets" p
USING "_tcw_deleted_employee_users" u
WHERE p."userId" = u."id";

DELETE FROM "notifications" n
USING "_tcw_deleted_employee_users" u
WHERE n."tenant_id" = u."tenant_id"
  AND n."userId" = u."id";

DELETE FROM "meghna_conversations" m
USING "_tcw_deleted_employee_users" u
WHERE m."tenant_id" = u."tenant_id"
  AND m."user_id" = u."id";

DELETE FROM "sessions" s
USING "_tcw_deleted_employee_users" u
WHERE s."userId" = u."id";

DELETE FROM "device_employee_maps" m
USING "_tcw_deleted_employees" d
WHERE m."tenant_id" = d."tenant_id"
  AND m."employee_id" = d."id";

DELETE FROM "attendance_punches" a
USING "_tcw_deleted_employees" d
WHERE a."tenant_id" = d."tenant_id"
  AND a."employeeId" = d."id";

DELETE FROM "attendance_daily" a
USING "_tcw_deleted_employees" d
WHERE a."tenant_id" = d."tenant_id"
  AND a."employeeId" = d."id";

DELETE FROM "leave_requests" l
USING "_tcw_deleted_employees" d
WHERE l."tenant_id" = d."tenant_id"
  AND l."employeeId" = d."id";

DELETE FROM "payroll_payouts" p
USING "_tcw_deleted_employees" d
WHERE p."tenant_id" = d."tenant_id"
  AND p."employee_id" = d."id";

DELETE FROM "payroll_adjustments" p
USING "_tcw_deleted_employees" d
WHERE p."tenant_id" = d."tenant_id"
  AND p."employeeId" = d."id";

DELETE FROM "payroll_items" p
USING "_tcw_deleted_employees" d
WHERE p."tenant_id" = d."tenant_id"
  AND p."employeeId" = d."id";

DELETE FROM "goals" g
USING "_tcw_deleted_employees" d
WHERE g."tenant_id" = d."tenant_id"
  AND g."employeeId" = d."id";

DELETE FROM "expense_claims" e
USING "_tcw_deleted_employees" d
WHERE e."tenant_id" = d."tenant_id"
  AND e."employeeId" = d."id";

DELETE FROM "travel_requests" t
USING "_tcw_deleted_employees" d
WHERE t."tenant_id" = d."tenant_id"
  AND t."employeeId" = d."id";

DELETE FROM "employee_exits" e
USING "_tcw_deleted_employees" d
WHERE e."tenant_id" = d."tenant_id"
  AND e."employeeId" = d."id";

DELETE FROM "employee_documents" e
USING "_tcw_deleted_employees" d
WHERE e."tenant_id" = d."tenant_id"
  AND e."employeeId" = d."id";

DELETE FROM "activity_events" a
USING "_tcw_deleted_employees" d
WHERE a."tenant_id" = d."tenant_id"
  AND a."employeeId" = d."id";

UPDATE "assets" a
SET "employeeId" = NULL,
    "status" = 'AVAILABLE'
FROM "_tcw_deleted_employees" d
WHERE a."tenant_id" = d."tenant_id"
  AND a."employeeId" = d."id";

UPDATE "employees" e
SET "managerId" = NULL
FROM "_tcw_deleted_employees" d
WHERE e."tenant_id" = d."tenant_id"
  AND e."managerId" = d."id";

DELETE FROM "users" u
USING "_tcw_deleted_employee_users" du
WHERE u."id" = du."id";

DELETE FROM "employees" e
USING "_tcw_deleted_employees" d
WHERE e."tenant_id" = d."tenant_id"
  AND e."id" = d."id";

-- Recalculate payroll totals after any deleted employee payroll items were removed.
UPDATE "payroll_runs" pr
SET
  "totalGross" = COALESCE((SELECT SUM(pi."gross") FROM "payroll_items" pi WHERE pi."tenant_id"=pr."tenant_id" AND pi."runId"=pr."id"),0),
  "totalDeductions" = COALESCE((SELECT SUM(pi."deductions") FROM "payroll_items" pi WHERE pi."tenant_id"=pr."tenant_id" AND pi."runId"=pr."id"),0),
  "totalNet" = COALESCE((SELECT SUM(pi."net") FROM "payroll_items" pi WHERE pi."tenant_id"=pr."tenant_id" AND pi."runId"=pr."id"),0);
