-- Owners who request a store package wait for approval with no dashboard access.
-- Additive: one column with a default, so existing businesses are unaffected (false).
ALTER TABLE "Business" ADD COLUMN "awaitingApproval" BOOLEAN NOT NULL DEFAULT false;
