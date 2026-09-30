UPDATE "employees" e
SET "designation" = d."name",
    "updated_at" = NOW()
FROM "designations" d
WHERE e."tenant_id" = d."tenant_id"
  AND e."designation" = d."id"::text;

DELETE FROM "payroll_runs" pr
WHERE pr."status" = 'DRAFT'
  AND pr."month" > TO_CHAR(CURRENT_DATE, 'YYYY-MM')
  AND NOT EXISTS (
    SELECT 1 FROM "payroll_items" pi
    WHERE pi."tenant_id" = pr."tenant_id"
      AND pi."runId" = pr."id"
  );
