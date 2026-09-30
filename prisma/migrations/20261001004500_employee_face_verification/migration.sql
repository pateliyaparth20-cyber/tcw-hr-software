CREATE TABLE IF NOT EXISTS "employee_face_profiles" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "template_ciphertext" TEXT NOT NULL,
  "template_version" TEXT NOT NULL DEFAULT 'face-api-1.7.15',
  "sample_count" INTEGER NOT NULL DEFAULT 3,
  "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_face_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "employee_face_profiles_tenant_id_id_key"
  ON "employee_face_profiles"("tenant_id","id");

CREATE UNIQUE INDEX IF NOT EXISTS "employee_face_profiles_tenant_id_employee_id_key"
  ON "employee_face_profiles"("tenant_id","employee_id");

CREATE INDEX IF NOT EXISTS "employee_face_profiles_tenant_id_idx"
  ON "employee_face_profiles"("tenant_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employee_face_profiles_tenant_fk') THEN
    ALTER TABLE "employee_face_profiles"
      ADD CONSTRAINT "employee_face_profiles_tenant_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employee_face_profiles_employee_fk') THEN
    ALTER TABLE "employee_face_profiles"
      ADD CONSTRAINT "employee_face_profiles_employee_fk"
      FOREIGN KEY ("tenant_id","employee_id") REFERENCES "employees"("tenant_id","id") ON DELETE CASCADE;
  END IF;
END $$;