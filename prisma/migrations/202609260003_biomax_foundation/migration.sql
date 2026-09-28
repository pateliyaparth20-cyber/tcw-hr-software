ALTER TABLE "attendance_devices"
  ADD COLUMN IF NOT EXISTS "connection_mode" TEXT NOT NULL DEFAULT 'CLOUD_PUSH',
  ADD COLUMN IF NOT EXISTS "api_secret_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "api_secret_hint" TEXT,
  ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP(3);

ALTER TABLE "attendance_devices" ALTER COLUMN "host" SET DEFAULT '';
ALTER TABLE "attendance_devices" ALTER COLUMN "port" SET DEFAULT 5005;
ALTER TABLE "attendance_devices" ALTER COLUMN "status" SET DEFAULT 'AWAITING_CONNECTION';
CREATE INDEX IF NOT EXISTS "attendance_devices_tenant_id_vendor_idx" ON "attendance_devices"("tenant_id", "vendor");

CREATE TABLE IF NOT EXISTS "device_employee_maps" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "device_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "device_user_id" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "last_synced_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "device_employee_maps_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "device_employee_maps_tenant_id_device_id_device_user_id_key" ON "device_employee_maps"("tenant_id","device_id","device_user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "device_employee_maps_tenant_id_device_id_employee_id_key" ON "device_employee_maps"("tenant_id","device_id","employee_id");
CREATE INDEX IF NOT EXISTS "device_employee_maps_tenant_id_device_id_idx" ON "device_employee_maps"("tenant_id","device_id");
CREATE INDEX IF NOT EXISTS "device_employee_maps_tenant_id_employee_id_idx" ON "device_employee_maps"("tenant_id","employee_id");

CREATE TABLE IF NOT EXISTS "device_sync_logs" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "device_id" UUID NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'INFO',
  "action" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "details" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "device_sync_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "device_sync_logs_tenant_id_device_id_created_at_idx" ON "device_sync_logs"("tenant_id","device_id","created_at");
ALTER TABLE "device_employee_maps" ADD CONSTRAINT "device_employee_maps_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
ALTER TABLE "device_employee_maps" ADD CONSTRAINT "device_employee_maps_device_tenant_fk" FOREIGN KEY ("tenant_id","device_id") REFERENCES "attendance_devices"("tenant_id","id") ON DELETE CASCADE;
ALTER TABLE "device_employee_maps" ADD CONSTRAINT "device_employee_maps_employee_tenant_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "employees"("tenant_id","id") ON DELETE RESTRICT;
ALTER TABLE "device_sync_logs" ADD CONSTRAINT "device_sync_logs_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT;
ALTER TABLE "device_sync_logs" ADD CONSTRAINT "device_sync_logs_device_tenant_fk" FOREIGN KEY ("tenant_id","device_id") REFERENCES "attendance_devices"("tenant_id","id") ON DELETE CASCADE;
