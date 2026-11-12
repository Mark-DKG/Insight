-- Insight Store shopper accounts.
-- Additive only: two new tables and one new nullable column on StoreOrder.
-- Existing orders and carts are untouched.

CREATE TABLE "StoreShopper" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "defaultAddress" TEXT,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreShopper_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoreShopper_email_key" ON "StoreShopper"("email");

CREATE TABLE "StoreShopperSession" (
    "id" TEXT NOT NULL,
    "shopperId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreShopperSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoreShopperSession_tokenHash_key" ON "StoreShopperSession"("tokenHash");
CREATE INDEX "StoreShopperSession_shopperId_idx" ON "StoreShopperSession"("shopperId");
CREATE INDEX "StoreShopperSession_expiresAt_idx" ON "StoreShopperSession"("expiresAt");
ALTER TABLE "StoreShopperSession" ADD CONSTRAINT "StoreShopperSession_shopperId_fkey" FOREIGN KEY ("shopperId") REFERENCES "StoreShopper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StoreOrder" ADD COLUMN "shopperId" TEXT;
CREATE INDEX "StoreOrder_shopperId_createdAt_idx" ON "StoreOrder"("shopperId", "createdAt");
ALTER TABLE "StoreOrder" ADD CONSTRAINT "StoreOrder_shopperId_fkey" FOREIGN KEY ("shopperId") REFERENCES "StoreShopper"("id") ON DELETE SET NULL ON UPDATE CASCADE;
