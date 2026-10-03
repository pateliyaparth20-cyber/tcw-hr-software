DO $$
DECLARE
  v_tenant uuid;
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM tenants
  WHERE lower(regexp_replace(name, '[^a-z0-9]+', '', 'g')) LIKE 'mdshah%';

  SELECT id INTO v_tenant
  FROM tenants
  WHERE lower(regexp_replace(name, '[^a-z0-9]+', '', 'g')) LIKE 'mdshah%'
  LIMIT 1;

  IF v_count = 0 THEN
    RAISE NOTICE 'MD Shah tenant reset skipped: tenant not present in this database.';
    RETURN;
  ELSIF v_count > 1 THEN
    RAISE EXCEPTION 'MD Shah tenant reset aborted: multiple matching tenants found: %', v_count;
  END IF;

  -- Remove dependent operational data first.
  DELETE FROM support_ticket_messages WHERE tenant_id = v_tenant;
  DELETE FROM payroll_items WHERE tenant_id = v_tenant;
  DELETE FROM payroll_payouts WHERE tenant_id = v_tenant;
  DELETE FROM payroll_adjustments WHERE tenant_id = v_tenant;
  DELETE FROM payments WHERE tenant_id = v_tenant;
  DELETE FROM candidateS WHERE tenant_id = v_tenant;
  DELETE FROM device_employee_maps WHERE tenant_id = v_tenant;
  DELETE FROM device_sync_logs WHERE tenant_id = v_tenant;
  DELETE FROM employee_face_profiles WHERE tenant_id = v_tenant;
  DELETE FROM attendance_punches WHERE tenant_id = v_tenant;
  DELETE FROM attendance_daily WHERE tenant_id = v_tenant;
  DELETE FROM attendance_period_locks WHERE tenant_id = v_tenant;
  DELETE FROM leave_requests WHERE tenant_id = v_tenant;
  DELETE FROM goals WHERE tenant_id = v_tenant;
  DELETE FROM expense_claims WHERE tenant_id = v_tenant;
  DELETE FROM travel_requests WHERE tenant_id = v_tenant;
  DELETE FROM employee_exits WHERE tenant_id = v_tenant;
  DELETE FROM employee_documents WHERE tenant_id = v_tenant;
  DELETE FROM activity_events WHERE tenant_id = v_tenant;
  DELETE FROM assets WHERE tenant_id = v_tenant;
  DELETE FROM notifications WHERE tenant_id = v_tenant;
  DELETE FROM meghna_conversations WHERE tenant_id = v_tenant;
  DELETE FROM payroll_runs WHERE tenant_id = v_tenant;
  DELETE FROM support_tickets WHERE tenant_id = v_tenant;
  DELETE FROM invoices WHERE tenant_id = v_tenant;
  DELETE FROM jobs WHERE tenant_id = v_tenant;
  DELETE FROM courses WHERE tenant_id = v_tenant;
  DELETE FROM calendar_events WHERE tenant_id = v_tenant;
  DELETE FROM attendance_devices WHERE tenant_id = v_tenant;
  DELETE FROM productivity_rules WHERE tenant_id = v_tenant;
  DELETE FROM salary_rules WHERE tenant_id = v_tenant;
  DELETE FROM leave_types WHERE tenant_id = v_tenant;

  -- Delete employee-linked app accounts while preserving company HR/admin accounts.
  DELETE FROM push_subscriptions WHERE tenant_id = v_tenant AND user_id IN (SELECT id FROM users WHERE tenant_id = v_tenant AND employee_id IS NOT NULL);
  DELETE FROM password_resets WHERE tenant_id = v_tenant AND user_id IN (SELECT id FROM users WHERE tenant_id = v_tenant AND employee_id IS NOT NULL);
  DELETE FROM sessions WHERE tenant_id = v_tenant AND user_id IN (SELECT id FROM users WHERE tenant_id = v_tenant AND employee_id IS NOT NULL);
  DELETE FROM users WHERE tenant_id = v_tenant AND employee_id IS NOT NULL;

  DELETE FROM employees WHERE tenant_id = v_tenant;
  DELETE FROM shifts WHERE tenant_id = v_tenant;
  DELETE FROM branches WHERE tenant_id = v_tenant;
  DELETE FROM departments WHERE tenant_id = v_tenant;
  DELETE FROM designations WHERE tenant_id = v_tenant;
  DELETE FROM teams WHERE tenant_id = v_tenant;
  DELETE FROM locations WHERE tenant_id = v_tenant;
  DELETE FROM cost_centers WHERE tenant_id = v_tenant;

  -- Clear tenant operational/system history but keep tenant and surviving admin login accounts.
  DELETE FROM outbox WHERE tenant_id = v_tenant;
  DELETE FROM audit_logs WHERE tenant_id = v_tenant;
END $$;
