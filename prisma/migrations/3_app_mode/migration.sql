-- Application mode per business: FULL (default) or INVENTORY_ONLY.
-- Additive and non-destructive: existing businesses default to FULL.
CREATE TYPE "AppMode" AS ENUM ('FULL', 'INVENTORY_ONLY');

ALTER TABLE "Business" ADD COLUMN "appMode" "AppMode" NOT NULL DEFAULT 'FULL';
