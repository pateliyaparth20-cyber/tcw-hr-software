-- Keep audit events append-only by default, but allow the explicit Super Admin
-- permanent company-delete transaction to purge audit rows for exactly one tenant.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT t.tgname
    FROM pg_trigger t
    WHERE t.tgrelid='audit_logs'::regclass
      AND NOT t.tgisinternal
      AND pg_get_functiondef(t.tgfoid) LIKE '%Audit events are append-only%'
  LOOP
    EXECUTE format('DROP TRIGGER %I ON audit_logs',r.tgname);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION preserve_audit_log() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE'
     AND current_setting('app.allow_audit_delete',true)='on'
     AND current_setting('app.audit_delete_tenant',true)=OLD.tenant_id::text THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Audit events are append-only';
END $$;

DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
CREATE TRIGGER audit_logs_append_only
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION preserve_audit_log();
