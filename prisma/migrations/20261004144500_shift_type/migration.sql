ALTER TABLE "shifts"
ADD COLUMN "shift_type" TEXT NOT NULL DEFAULT 'REGULAR';

UPDATE "shifts"
SET "shift_type" = CASE
  WHEN "endMinute" <= "startMinute" THEN 'NIGHT'
  WHEN LOWER("name") LIKE '%half%' THEN 'HALF_DAY'
  WHEN "startMinute" < 720 THEN 'MORNING'
  WHEN "startMinute" >= 780 THEN 'EVENING'
  ELSE 'REGULAR'
END;
