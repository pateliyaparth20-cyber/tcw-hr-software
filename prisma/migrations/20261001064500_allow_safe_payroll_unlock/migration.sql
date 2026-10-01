-- Permit one controlled payroll unlock path while keeping finalized payroll immutable.
-- A locked run may move back to DRAFT only before any payout exists and only
-- the workflow-state fields may change. Payroll values/items remain protected.

CREATE OR REPLACE FUNCTION protect_locked_payroll() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'payroll_runs' THEN
    IF OLD.status = 'LOCKED' THEN
      IF TG_OP = 'UPDATE'
         AND NEW.status = 'DRAFT'
         AND NEW."lockedAt" IS NULL
         AND NEW."approvedBy" IS NULL
         AND NOT EXISTS (
           SELECT 1
           FROM payroll_payouts pp
           WHERE pp."tenant_id" = OLD."tenant_id"
             AND pp."run_id" = OLD."id"
         )
         AND (
           to_jsonb(NEW)
             - 'status'
             - 'lockedAt'
             - 'approvedBy'
             - 'attendance_lock_id'
             - 'updated_at'
         ) IS NOT DISTINCT FROM (
           to_jsonb(OLD)
             - 'status'
             - 'lockedAt'
             - 'approvedBy'
             - 'attendance_lock_id'
             - 'updated_at'
         )
      THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Finalized payroll is immutable';
    END IF;
  ELSE
    IF TG_OP != 'INSERT' AND EXISTS (
      SELECT 1 FROM payroll_runs WHERE id=OLD."runId" AND status='LOCKED'
    ) THEN
      RAISE EXCEPTION 'Finalized payroll items are immutable';
    END IF;
    IF TG_OP != 'DELETE' AND EXISTS (
      SELECT 1 FROM payroll_runs WHERE id=NEW."runId" AND status='LOCKED'
    ) THEN
      RAISE EXCEPTION 'Cannot insert into finalized payroll';
    END IF;
  END IF;

  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
