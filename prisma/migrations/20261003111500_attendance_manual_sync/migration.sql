ALTER TABLE "attendance_daily" ADD COLUMN "synced_at" TIMESTAMP(3);

-- Existing rows predate explicit manual sync. Keep them editable/deletable until HR syncs them.
