-- Insight Store: packages, seller applications, seller profiles, listings,
-- carts, seller-separated orders, attribution, notifications.
-- Additive only. Existing rows are untouched apart from new nullable columns.

-- 1. Business packages (AppMode gains two values; FULL and INVENTORY_ONLY unchanged)
ALTER TYPE "AppMode" ADD VALUE IF NOT EXISTS 'STORE_INVENTORY';
ALTER TYPE "AppMode" ADD VALUE IF NOT EXISTS 'POS_INVENTORY';
-- Package requested but waiting for Store seller approval.
ALTER TABLE "Business" ADD COLUMN "pendingAppMode" "AppMode";

-- 2. Notification extensions: per-user delivery, deep links, de-duplication
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SALES_ACTIVITY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'STORE_APPLICATION';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'STORE_LISTING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'STORE_ORDER';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'STORE_SELLER';
ALTER TABLE "Notification" ADD COLUMN "userId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "link" TEXT;
ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT;
ALTER TABLE "Notification" ADD COLUMN "readAt" TIMESTAMP(3);
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

CREATE TABLE "PlatformNotification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformNotification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlatformNotification_dedupeKey_key" ON "PlatformNotification"("dedupeKey");
CREATE INDEX "PlatformNotification_createdAt_idx" ON "PlatformNotification"("createdAt");
CREATE TABLE "PlatformNotificationRead" (
    "notificationId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformNotificationRead_pkey" PRIMARY KEY ("notificationId", "adminId")
);
ALTER TABLE "PlatformNotificationRead" ADD CONSTRAINT "PlatformNotificationRead_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "PlatformNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformNotificationRead" ADD CONSTRAINT "PlatformNotificationRead_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "PlatformAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Store enums
CREATE TYPE "SellerApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUIRED', 'APPROVED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "SellerStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'UNPUBLISHED');
CREATE TYPE "StoreOrderStatus" AS ENUM ('NEW', 'CONFIRMED', 'AWAITING_PAYMENT', 'PAID', 'PROCESSING', 'READY_FOR_COLLECTION', 'DISPATCHED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "StorePaymentStatus" AS ENUM ('UNPAID', 'PAID', 'REFUNDED');
CREATE TYPE "StoreFulfilment" AS ENUM ('DELIVERY', 'COLLECTION');

-- 4. Marketplace configuration (single row, id = 'default')
CREATE TABLE "StoreConfig" (
    "id" TEXT NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "announcement" TEXT,
    "policies" TEXT,
    "orderExpiryHours" INTEGER NOT NULL DEFAULT 48,
    "requiredDocuments" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreConfig_pkey" PRIMARY KEY ("id")
);
INSERT INTO "StoreConfig" ("id", "requiredDocuments") VALUES ('default',
  '[{"key":"registration","label":"Business registration certificate","required":false},{"key":"authority","label":"Evidence of authority to represent the business","required":false}]');

-- 5. Seller applications
CREATE TABLE "StoreSellerApplication" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "applicantUserId" TEXT,
    "status" "SellerApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "data" JSONB NOT NULL DEFAULT '{}',
    "requestedAppMode" "AppMode",
    "infoRequest" TEXT,
    "decisionReason" TEXT,
    "decidedByAdminId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreSellerApplication_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoreSellerApplication_reference_key" ON "StoreSellerApplication"("reference");
CREATE INDEX "StoreSellerApplication_businessId_idx" ON "StoreSellerApplication"("businessId");
CREATE INDEX "StoreSellerApplication_status_submittedAt_idx" ON "StoreSellerApplication"("status", "submittedAt");
-- At most one open application per business.
CREATE UNIQUE INDEX "StoreSellerApplication_one_open_per_business" ON "StoreSellerApplication"("businessId")
  WHERE "status" IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUIRED');
ALTER TABLE "StoreSellerApplication" ADD CONSTRAINT "StoreSellerApplication_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreSellerApplication" ADD CONSTRAINT "StoreSellerApplication_applicantUserId_fkey" FOREIGN KEY ("applicantUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "StoreApplicationEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreApplicationEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StoreApplicationEvent_applicationId_createdAt_idx" ON "StoreApplicationEvent"("applicationId", "createdAt");
ALTER TABLE "StoreApplicationEvent" ADD CONSTRAINT "StoreApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "StoreSellerApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Private application documents (stored in the database; served only through
-- authorised API routes, never as public files).
CREATE TABLE "StoreDocument" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "docKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StoreDocument_applicationId_idx" ON "StoreDocument"("applicationId");
ALTER TABLE "StoreDocument" ADD CONSTRAINT "StoreDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "StoreSellerApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Seller participation and public profile (one per business)
CREATE TABLE "StoreSeller" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "status" "SellerStatus" NOT NULL DEFAULT 'ACTIVE',
    "slug" TEXT NOT NULL,
    "approvedApplicationId" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT,
    "publicPhone" TEXT,
    "whatsappNumber" TEXT,
    "publicEmail" TEXT,
    "openingHours" TEXT,
    "offersDelivery" BOOLEAN NOT NULL DEFAULT false,
    "deliveryInfo" TEXT,
    "offersCollection" BOOLEAN NOT NULL DEFAULT true,
    "collectionInfo" TEXT,
    "fulfilmentBranchId" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "suspendedAt" TIMESTAMP(3),
    "suspendedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreSeller_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoreSeller_businessId_key" ON "StoreSeller"("businessId");
CREATE UNIQUE INDEX "StoreSeller_slug_key" ON "StoreSeller"("slug");
CREATE INDEX "StoreSeller_status_idx" ON "StoreSeller"("status");
ALTER TABLE "StoreSeller" ADD CONSTRAINT "StoreSeller_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreSeller" ADD CONSTRAINT "StoreSeller_fulfilmentBranchId_fkey" FOREIGN KEY ("fulfilmentBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. Central categories
CREATE TABLE "StoreCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoreCategory_slug_key" ON "StoreCategory"("slug");
INSERT INTO "StoreCategory" ("id", "name", "slug", "sortOrder") VALUES
  (gen_random_uuid()::text, 'Groceries & Food', 'groceries-food', 10),
  (gen_random_uuid()::text, 'Beverages', 'beverages', 20),
  (gen_random_uuid()::text, 'Health & Beauty', 'health-beauty', 30),
  (gen_random_uuid()::text, 'Household', 'household', 40),
  (gen_random_uuid()::text, 'Fashion', 'fashion', 50),
  (gen_random_uuid()::text, 'Electronics', 'electronics', 60),
  (gen_random_uuid()::text, 'Phones & Accessories', 'phones-accessories', 70),
  (gen_random_uuid()::text, 'Home & Office', 'home-office', 80),
  (gen_random_uuid()::text, 'Baby & Kids', 'baby-kids', 90),
  (gen_random_uuid()::text, 'Other', 'other', 1000);

-- 8. Listings: publication layer over existing products (no duplicate catalogue,
-- no separate stock; availability is read from InventoryLevel).
CREATE TABLE "StoreListing" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "categoryId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2),
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "rejectionReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "reviewedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreListing_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoreListing_productId_key" ON "StoreListing"("productId");
CREATE INDEX "StoreListing_businessId_status_idx" ON "StoreListing"("businessId", "status");
CREATE INDEX "StoreListing_status_isVisible_publishedAt_idx" ON "StoreListing"("status", "isVisible", "publishedAt");
CREATE INDEX "StoreListing_categoryId_idx" ON "StoreListing"("categoryId");
ALTER TABLE "StoreListing" ADD CONSTRAINT "StoreListing_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreListing" ADD CONSTRAINT "StoreListing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreListing" ADD CONSTRAINT "StoreListing_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "StoreCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StoreListing" ADD CONSTRAINT "StoreListing_price_check" CHECK ("price" IS NULL OR "price" >= 0);

CREATE TABLE "StoreListingEvent" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreListingEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StoreListingEvent_listingId_createdAt_idx" ON "StoreListingEvent"("listingId", "createdAt");
ALTER TABLE "StoreListingEvent" ADD CONSTRAINT "StoreListingEvent_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "StoreListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Listing images (public once the listing is published).
CREATE TABLE "StoreImage" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreImage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StoreImage_listingId_sortOrder_idx" ON "StoreImage"("listingId", "sortOrder");
ALTER TABLE "StoreImage" ADD CONSTRAINT "StoreImage_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "StoreListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 9. Guest carts (identified by an opaque token cookie; only its hash is stored)
CREATE TABLE "StoreCart" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreCart_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoreCart_tokenHash_key" ON "StoreCart"("tokenHash");
CREATE TABLE "StoreCartItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreCartItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoreCartItem_quantity_check" CHECK ("quantity" > 0 AND "quantity" <= 999)
);
CREATE UNIQUE INDEX "StoreCartItem_cartId_listingId_key" ON "StoreCartItem"("cartId", "listingId");
ALTER TABLE "StoreCartItem" ADD CONSTRAINT "StoreCartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "StoreCart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreCartItem" ADD CONSTRAINT "StoreCartItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "StoreListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 10. Seller-specific order requests
CREATE TABLE "StoreOrder" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT,
    "status" "StoreOrderStatus" NOT NULL DEFAULT 'NEW',
    "paymentStatus" "StorePaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "currency" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "fulfilment" "StoreFulfilment" NOT NULL,
    "deliveryAddress" TEXT,
    "note" TEXT,
    "lookupTokenHash" TEXT NOT NULL,
    "stockDeducted" BOOLEAN NOT NULL DEFAULT false,
    "whatsappLinkGeneratedAt" TIMESTAMP(3),
    "whatsappOpenedAt" TIMESTAMP(3),
    "attributionChannel" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreOrder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoreOrder_subtotal_check" CHECK ("subtotal" >= 0)
);
CREATE UNIQUE INDEX "StoreOrder_reference_key" ON "StoreOrder"("reference");
CREATE INDEX "StoreOrder_businessId_status_createdAt_idx" ON "StoreOrder"("businessId", "status", "createdAt");
CREATE INDEX "StoreOrder_checkoutId_idx" ON "StoreOrder"("checkoutId");
CREATE INDEX "StoreOrder_status_expiresAt_idx" ON "StoreOrder"("status", "expiresAt");
ALTER TABLE "StoreOrder" ADD CONSTRAINT "StoreOrder_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreOrder" ADD CONSTRAINT "StoreOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "StoreOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "listingId" TEXT,
    "productId" TEXT NOT NULL,
    "titleSnapshot" TEXT NOT NULL,
    "skuSnapshot" TEXT,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "StoreOrderItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StoreOrderItem_quantity_check" CHECK ("quantity" > 0)
);
CREATE INDEX "StoreOrderItem_orderId_idx" ON "StoreOrderItem"("orderId");
ALTER TABLE "StoreOrderItem" ADD CONSTRAINT "StoreOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "StoreOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreOrderItem" ADD CONSTRAINT "StoreOrderItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "StoreListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StoreOrderItem" ADD CONSTRAINT "StoreOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "StoreOrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreOrderEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StoreOrderEvent_orderId_createdAt_idx" ON "StoreOrderEvent"("orderId", "createdAt");
ALTER TABLE "StoreOrderEvent" ADD CONSTRAINT "StoreOrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "StoreOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Idempotent checkout: the same client checkout key never creates orders twice.
CREATE TABLE "StoreCheckout" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreCheckout_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoreCheckout_idempotencyKey_key" ON "StoreCheckout"("idempotencyKey");

-- 11. Attribution (anonymous: channel + target + event; no personal data)
CREATE TABLE "StoreAttributionEvent" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "businessId" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoreAttributionEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StoreAttributionEvent_channel_event_createdAt_idx" ON "StoreAttributionEvent"("channel", "event", "createdAt");
CREATE INDEX "StoreAttributionEvent_businessId_createdAt_idx" ON "StoreAttributionEvent"("businessId", "createdAt");
