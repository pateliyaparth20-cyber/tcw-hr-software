-- Recovery-safe: preserves immutable attendance and finalized payroll audit history.
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

-- Historical attendance, leave, payroll and workforce transactions are audit records.
-- They are intentionally retained for archived employees; active application queries hide tombstones.
-- Raw attendance punches are immutable at database level and must never be deleted.

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

-- Keep the archived employee tombstone because immutable raw punches reference it.
-- It remains hidden from every active People/Attendance/Leave query via deletedAt.
UPDATE "employees" e
SET "status" = 'INACTIVE'
FROM "_tcw_deleted_employees" d
WHERE e."tenant_id" = d."tenant_id"
  AND e."id" = d."id";

