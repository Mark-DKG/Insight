-- Phase A1/A3: database-level floors that back up the application's atomic
-- stock and credit logic. Additive only: no data is changed.
--
-- PRE-CHECK (run first; both must return 0 rows, otherwise STOP and clean up with the owner):
--   SELECT id, "productId", "branchId", quantity FROM "InventoryLevel" WHERE quantity < 0;
--   SELECT id, "saleId", "originalAmount", "amountPaid" FROM "CreditAccount" WHERE "amountPaid" < 0 OR "amountPaid" > "originalAmount";

ALTER TABLE "InventoryLevel"
  ADD CONSTRAINT "InventoryLevel_quantity_nonnegative" CHECK ("quantity" >= 0);

ALTER TABLE "CreditAccount"
  ADD CONSTRAINT "CreditAccount_amountPaid_within_original" CHECK ("amountPaid" >= 0 AND "amountPaid" <= "originalAmount");
