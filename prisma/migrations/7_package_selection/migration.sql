-- Owners choose a package right after signup. Existing businesses already run on
-- a package, so they are marked as having chosen (nothing changes for them).
ALTER TABLE "Business" ADD COLUMN "packageSelectedAt" TIMESTAMP(3);
UPDATE "Business" SET "packageSelectedAt" = "createdAt" WHERE "packageSelectedAt" IS NULL;
