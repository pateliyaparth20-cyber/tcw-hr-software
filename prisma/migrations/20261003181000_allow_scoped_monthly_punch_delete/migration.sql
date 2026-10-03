-- Keep raw punches immutable by default, but allow the explicit Monthly Automation
-- reset transaction to delete punches for exactly one tenant.
CREATE OR REPLACE FUNCTION preserve_raw_punch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF current_setting('app.allow_raw_punch_delete', true) = 'on'
       AND current_setting('app.raw_punch_delete_tenant', true) = OLD.tenant_id::text THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Raw punches cannot be deleted';
  END IF;
  IF (to_jsonb(NEW) - 'processedAt' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'processedAt' - 'updated_at') THEN
    RAISE EXCEPTION 'Raw punch evidence cannot be changed';
  END IF;
  RETURN NEW;
END $$;
