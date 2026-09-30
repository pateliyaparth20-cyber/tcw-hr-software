INSERT INTO "branches" ("id","tenant_id","name","code","description","created_at","updated_at")
SELECT l."id",l."tenant_id",l."name",l."code",l."description",l."created_at",l."updated_at"
FROM "locations" l
WHERE NOT EXISTS (
  SELECT 1 FROM "branches" b
  WHERE b."tenant_id"=l."tenant_id" AND (b."code"=l."code" OR b."id"=l."id")
);
