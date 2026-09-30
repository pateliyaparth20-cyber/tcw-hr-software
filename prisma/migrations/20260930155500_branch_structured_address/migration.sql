ALTER TABLE "branches"
  ADD COLUMN IF NOT EXISTS "location" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "address_line" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "city" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "state" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "pincode" TEXT NOT NULL DEFAULT '';

UPDATE "branches"
SET "location" = CASE
  WHEN COALESCE("location",'') <> '' THEN "location"
  WHEN COALESCE("description",'') <> '' THEN "description"
  ELSE "name"
END
WHERE COALESCE("location",'') = '';
