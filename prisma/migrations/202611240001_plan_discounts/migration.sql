ALTER TABLE "plans"
  ADD COLUMN "monthly_discount_percent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "yearly_discount_percent" INTEGER NOT NULL DEFAULT 15;
