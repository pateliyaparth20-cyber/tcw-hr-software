ALTER TABLE "shifts"
  ADD COLUMN "work_week_mode" TEXT NOT NULL DEFAULT 'CUSTOM_WEEKLY',
  ADD COLUMN "alternate_saturday_mode" TEXT NOT NULL DEFAULT 'SECOND_FOURTH_OFF',
  ADD COLUMN "monthly_flexible_off_days" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "calendar_events"
  ADD COLUMN "shift_id" UUID;

CREATE INDEX "calendar_events_tenant_id_shift_id_date_idx"
  ON "calendar_events"("tenant_id", "shift_id", "date");
