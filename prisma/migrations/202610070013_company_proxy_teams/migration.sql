ALTER TABLE "sessions" ADD COLUMN "proxy_parent_session_id" UUID, ADD COLUMN "proxy_grant" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "employees" ADD COLUMN "team_id" UUID;
CREATE INDEX "employees_tenant_id_team_id_idx" ON "employees" ("tenant_id", "team_id");
ALTER TABLE "employees" ADD CONSTRAINT "employees_team_tenant_fk" FOREIGN KEY ("tenant_id", "team_id") REFERENCES "teams" ("tenant_id", "id") ON DELETE RESTRICT;
