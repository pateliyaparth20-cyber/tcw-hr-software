-- Database-level tenant references and immutable accounting records.

ALTER TABLE "users" ADD CONSTRAINT "users_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "users" ADD CONSTRAINT "users_employee_tenant_fk" FOREIGN KEY ("tenant_id", "employeeId") REFERENCES "employees"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "outbox" ADD CONSTRAINT "outbox_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "departments" ADD CONSTRAINT "departments_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "designations" ADD CONSTRAINT "designations_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "teams" ADD CONSTRAINT "teams_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "locations" ADD CONSTRAINT "locations_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "shifts" ADD CONSTRAINT "shifts_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "attendance_devices" ADD CONSTRAINT "attendance_devices_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_employee_tenant_fk" FOREIGN KEY ("tenant_id", "employeeId") REFERENCES "employees"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "attendance_daily" ADD CONSTRAINT "attendance_daily_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "attendance_daily" ADD CONSTRAINT "attendance_daily_employee_tenant_fk" FOREIGN KEY ("tenant_id", "employeeId") REFERENCES "employees"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_tenant_fk" FOREIGN KEY ("tenant_id", "employeeId") REFERENCES "employees"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_employee_tenant_fk" FOREIGN KEY ("tenant_id", "employeeId") REFERENCES "employees"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_employee_tenant_fk" FOREIGN KEY ("tenant_id", "employeeId") REFERENCES "employees"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "salary_rules" ADD CONSTRAINT "salary_rules_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "jobs" ADD CONSTRAINT "jobs_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "candidates" ADD CONSTRAINT "candidates_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "goals" ADD CONSTRAINT "goals_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "goals" ADD CONSTRAINT "goals_employee_tenant_fk" FOREIGN KEY ("tenant_id", "employeeId") REFERENCES "employees"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "courses" ADD CONSTRAINT "courses_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "assets" ADD CONSTRAINT "assets_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "assets" ADD CONSTRAINT "assets_employee_tenant_fk" FOREIGN KEY ("tenant_id", "employeeId") REFERENCES "employees"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_employee_tenant_fk" FOREIGN KEY ("tenant_id", "employeeId") REFERENCES "employees"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "travel_requests" ADD CONSTRAINT "travel_requests_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "travel_requests" ADD CONSTRAINT "travel_requests_employee_tenant_fk" FOREIGN KEY ("tenant_id", "employeeId") REFERENCES "employees"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "employee_exits" ADD CONSTRAINT "employee_exits_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "employee_exits" ADD CONSTRAINT "employee_exits_employee_tenant_fk" FOREIGN KEY ("tenant_id", "employeeId") REFERENCES "employees"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_tenant_fk" FOREIGN KEY ("tenant_id", "employeeId") REFERENCES "employees"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_employee_tenant_fk" FOREIGN KEY ("tenant_id", "employeeId") REFERENCES "employees"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "productivity_rules" ADD CONSTRAINT "productivity_rules_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;

ALTER TABLE "employees" ADD CONSTRAINT "employees_departmentId_tenant_fk" FOREIGN KEY ("tenant_id", "departmentId") REFERENCES "departments"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "employees" ADD CONSTRAINT "employees_branchId_tenant_fk" FOREIGN KEY ("tenant_id", "branchId") REFERENCES "branches"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "employees" ADD CONSTRAINT "employees_managerId_tenant_fk" FOREIGN KEY ("tenant_id", "managerId") REFERENCES "employees"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "attendance_devices" ADD CONSTRAINT "attendance_devices_branchId_tenant_fk" FOREIGN KEY ("tenant_id", "branchId") REFERENCES "branches"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_deviceId_tenant_fk" FOREIGN KEY ("tenant_id", "deviceId") REFERENCES "attendance_devices"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leaveTypeId_tenant_fk" FOREIGN KEY ("tenant_id", "leaveTypeId") REFERENCES "leave_types"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "jobs" ADD CONSTRAINT "jobs_departmentId_tenant_fk" FOREIGN KEY ("tenant_id", "departmentId") REFERENCES "departments"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "candidates" ADD CONSTRAINT "candidates_jobId_tenant_fk" FOREIGN KEY ("tenant_id", "jobId") REFERENCES "jobs"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_originalRunId_tenant_fk" FOREIGN KEY ("tenant_id", "originalRunId") REFERENCES "payroll_runs"("tenant_id", "id") ON DELETE RESTRICT;

ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_appliedRunId_tenant_fk" FOREIGN KEY ("tenant_id", "appliedRunId") REFERENCES "payroll_runs"("tenant_id", "id") ON DELETE RESTRICT;

CREATE UNIQUE INDEX "platform_user_email_unique" ON "users" ("email") WHERE "tenant_id" IS NULL;

CREATE UNIQUE INDEX "invoices_tenant_id_pair" ON "invoices" ("tenant_id","id");

ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_tenant_fk" FOREIGN KEY ("tenant_id","invoiceId") REFERENCES "invoices"("tenant_id","id");


CREATE FUNCTION protect_locked_payroll() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'payroll_runs' THEN
    IF OLD.status = 'LOCKED' THEN RAISE EXCEPTION 'Finalized payroll is immutable'; END IF;
  ELSE
    IF TG_OP != 'INSERT' AND EXISTS (SELECT 1 FROM payroll_runs WHERE id=OLD."runId" AND status='LOCKED') THEN
      RAISE EXCEPTION 'Finalized payroll items are immutable';
    END IF;
    IF TG_OP != 'DELETE' AND EXISTS (SELECT 1 FROM payroll_runs WHERE id=NEW."runId" AND status='LOCKED') THEN
      RAISE EXCEPTION 'Cannot insert into finalized payroll';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_payroll BEFORE UPDATE OR DELETE ON payroll_runs FOR EACH ROW EXECUTE FUNCTION protect_locked_payroll();
CREATE TRIGGER immutable_payroll_items BEFORE INSERT OR UPDATE OR DELETE ON payroll_items FOR EACH ROW EXECUTE FUNCTION protect_locked_payroll();
CREATE FUNCTION preserve_raw_punch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Raw punches cannot be deleted'; END IF;
  IF (to_jsonb(NEW) - 'processedAt' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'processedAt' - 'updated_at') THEN
    RAISE EXCEPTION 'Raw punch evidence cannot be changed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_punches BEFORE UPDATE OR DELETE ON attendance_punches FOR EACH ROW EXECUTE FUNCTION preserve_raw_punch();
CREATE FUNCTION preserve_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit events are append-only'; END $$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION preserve_audit();
ALTER TABLE payroll_items ADD CONSTRAINT payroll_nonnegative CHECK (net >= 0 AND deductions >= 0);
ALTER TABLE employees ADD CONSTRAINT employee_salary_nonnegative CHECK ("monthlySalary" >= 0);
ALTER TABLE leave_requests ADD CONSTRAINT leave_valid_dates CHECK ("endDate" >= "startDate" AND days > 0);

