CREATE TABLE "employee_biometric_devices" (
 "id" UUID NOT NULL, "tenant_id" UUID NOT NULL, "employee_id" UUID NOT NULL,
 "public_key" TEXT NOT NULL, "key_hash" TEXT NOT NULL, "label" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING', "approved_by" UUID, "approved_at" TIMESTAMP(3),
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "employee_biometric_devices_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "biometric_employee_fkey" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "employees"("tenant_id","id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "employee_biometric_devices_tenant_id_employee_id_key_hash_key" ON "employee_biometric_devices"("tenant_id","employee_id","key_hash");
CREATE INDEX "employee_biometric_devices_tenant_id_status_idx" ON "employee_biometric_devices"("tenant_id","status");
CREATE TABLE "biometric_challenges" (
 "id" UUID NOT NULL, "tenant_id" UUID NOT NULL, "employee_id" UUID NOT NULL,
 "user_id" UUID NOT NULL, "session_id" UUID NOT NULL, "device_id" UUID,
 "purpose" TEXT NOT NULL, "intent" TEXT NOT NULL, "payload" TEXT NOT NULL,
 "expires_at" TIMESTAMP(3) NOT NULL, "used_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "biometric_challenges_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "biometric_challenges_tenant_id_employee_id_created_at_idx" ON "biometric_challenges"("tenant_id","employee_id","created_at");
