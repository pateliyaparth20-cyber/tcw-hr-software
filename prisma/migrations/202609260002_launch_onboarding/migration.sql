ALTER TABLE "users" ADD COLUMN "login_id" TEXT;
CREATE UNIQUE INDEX "users_tenant_id_login_id_key" ON "users"("tenant_id", "login_id");
CREATE INDEX "users_login_id_idx" ON "users"("login_id");
