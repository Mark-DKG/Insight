-- Baseline: the schema as originally created on Neon (applied 2026-11-05).
-- Recorded as already applied in _prisma_migrations; never re-run on production.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Enums
-- ============================================================
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'MANAGER', 'CASHIER');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CARD', 'CREDIT', 'OTHER');
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'PENDING', 'REFUNDED', 'VOIDED');
CREATE TYPE "InventoryMovementType" AS ENUM ('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'DAMAGED', 'EXPIRED', 'RETURNED', 'COUNT_CORRECTION');
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');
CREATE TYPE "ExpenseCategory" AS ENUM ('RENT', 'UTILITIES', 'TRANSPORT', 'SALARIES', 'MAINTENANCE', 'MARKETING', 'INTERNET', 'OTHER');
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCED', 'CONFLICT', 'FAILED');
CREATE TYPE "NotificationType" AS ENUM ('LOW_STOCK', 'OUT_OF_STOCK', 'DEAD_STOCK', 'STOCK_DISCREPANCY', 'CUSTOMER_CREDIT_DUE', 'SUPPLIER_PAYMENT_DUE', 'SYNC_ERROR', 'TRANSACTION_FAILED', 'GENERAL');

-- ============================================================
-- Business
-- ============================================================
CREATE TABLE "Business" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "logoUrl" TEXT,
  "address" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'GHS',
  "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "isDemo" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "Business_name_idx" ON "Business"("name");

-- ============================================================
-- Branch (referenced by User, so created before User)
-- ============================================================
CREATE TABLE "Branch" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "phone" TEXT,
  "isMain" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "Branch_businessId_idx" ON "Branch"("businessId");

-- ============================================================
-- User
-- ============================================================
CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "branchId" TEXT REFERENCES "Branch"("id"),
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'CASHIER',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "User_businessId_idx" ON "User"("businessId");
CREATE INDEX "User_branchId_idx" ON "User"("branchId");

-- ============================================================
-- RefreshToken
-- ============================================================
CREATE TABLE "RefreshToken" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- ============================================================
-- Category
-- ============================================================
CREATE TABLE "Category" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  UNIQUE ("businessId", "name")
);
CREATE INDEX "Category_businessId_idx" ON "Category"("businessId");

-- ============================================================
-- Supplier (referenced by Product, before Product)
-- ============================================================
CREATE TABLE "Supplier" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "outstandingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "Supplier_businessId_idx" ON "Supplier"("businessId");

-- ============================================================
-- Product
-- ============================================================
CREATE TABLE "Product" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "categoryId" TEXT REFERENCES "Category"("id"),
  "supplierId" TEXT REFERENCES "Supplier"("id"),
  "name" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "barcode" TEXT,
  "description" TEXT,
  "costPrice" DECIMAL(12,2) NOT NULL,
  "sellingPrice" DECIMAL(12,2) NOT NULL,
  "minStockLevel" INTEGER NOT NULL DEFAULT 0,
  "maxStockLevel" INTEGER,
  "unit" TEXT NOT NULL DEFAULT 'Unit',
  "imageUrl" TEXT,
  "expiryDate" TIMESTAMP(3),
  "taxable" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  UNIQUE ("businessId", "sku"),
  UNIQUE ("businessId", "barcode")
);
CREATE INDEX "Product_businessId_idx" ON "Product"("businessId");
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");
CREATE INDEX "Product_supplierId_idx" ON "Product"("supplierId");

-- ============================================================
-- InventoryLevel
-- ============================================================
CREATE TABLE "InventoryLevel" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "productId" TEXT NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
  "branchId" TEXT NOT NULL REFERENCES "Branch"("id") ON DELETE CASCADE,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  UNIQUE ("productId", "branchId")
);
CREATE INDEX "InventoryLevel_branchId_idx" ON "InventoryLevel"("branchId");

-- ============================================================
-- InventoryMovement
-- ============================================================
CREATE TABLE "InventoryMovement" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "branchId" TEXT NOT NULL REFERENCES "Branch"("id") ON DELETE CASCADE,
  "productId" TEXT NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
  "type" "InventoryMovementType" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "reason" TEXT,
  "referenceId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "InventoryMovement_businessId_idx" ON "InventoryMovement"("businessId");
CREATE INDEX "InventoryMovement_productId_idx" ON "InventoryMovement"("productId");
CREATE INDEX "InventoryMovement_branchId_idx" ON "InventoryMovement"("branchId");
CREATE INDEX "InventoryMovement_createdAt_idx" ON "InventoryMovement"("createdAt");

-- ============================================================
-- Purchase / PurchaseItem
-- ============================================================
CREATE TABLE "Purchase" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "branchId" TEXT NOT NULL REFERENCES "Branch"("id"),
  "supplierId" TEXT NOT NULL REFERENCES "Supplier"("id"),
  "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
  "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "expectedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "totalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "Purchase_businessId_idx" ON "Purchase"("businessId");
CREATE INDEX "Purchase_supplierId_idx" ON "Purchase"("supplierId");
CREATE INDEX "Purchase_branchId_idx" ON "Purchase"("branchId");

CREATE TABLE "PurchaseItem" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "purchaseId" TEXT NOT NULL REFERENCES "Purchase"("id") ON DELETE CASCADE,
  "productId" TEXT NOT NULL REFERENCES "Product"("id"),
  "quantityOrdered" INTEGER NOT NULL,
  "quantityReceived" INTEGER NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(12,2) NOT NULL
);
CREATE INDEX "PurchaseItem_purchaseId_idx" ON "PurchaseItem"("purchaseId");
CREATE INDEX "PurchaseItem_productId_idx" ON "PurchaseItem"("productId");

-- ============================================================
-- Customer
-- ============================================================
CREATE TABLE "Customer" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "creditLimit" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "creditBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "Customer_businessId_idx" ON "Customer"("businessId");

-- ============================================================
-- Sale / SaleItem / Payment  (Sale before CreditAccount, since CreditAccount.saleId references Sale)
-- ============================================================
CREATE TABLE "Sale" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "branchId" TEXT NOT NULL REFERENCES "Branch"("id"),
  "cashierId" TEXT NOT NULL REFERENCES "User"("id"),
  "customerId" TEXT REFERENCES "Customer"("id"),
  "receiptNumber" TEXT NOT NULL,
  "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
  "subtotal" DECIMAL(12,2) NOT NULL,
  "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(12,2) NOT NULL,
  "costOfGoods" DECIMAL(12,2) NOT NULL,
  "grossProfit" DECIMAL(12,2) NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "clientTxnId" TEXT NOT NULL,
  "syncStatus" "SyncStatus" NOT NULL DEFAULT 'SYNCED',
  "voidedReason" TEXT,
  "refundedFromId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  UNIQUE ("businessId", "clientTxnId"),
  UNIQUE ("businessId", "receiptNumber")
);
CREATE INDEX "Sale_businessId_idx" ON "Sale"("businessId");
CREATE INDEX "Sale_branchId_idx" ON "Sale"("branchId");
CREATE INDEX "Sale_cashierId_idx" ON "Sale"("cashierId");
CREATE INDEX "Sale_customerId_idx" ON "Sale"("customerId");
CREATE INDEX "Sale_createdAt_idx" ON "Sale"("createdAt");

CREATE TABLE "SaleItem" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "saleId" TEXT NOT NULL REFERENCES "Sale"("id") ON DELETE CASCADE,
  "productId" TEXT NOT NULL REFERENCES "Product"("id"),
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "unitCost" DECIMAL(12,2) NOT NULL,
  "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "lineTotal" DECIMAL(12,2) NOT NULL,
  "lineProfit" DECIMAL(12,2) NOT NULL
);
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");
CREATE INDEX "SaleItem_productId_idx" ON "SaleItem"("productId");

CREATE TABLE "Payment" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "saleId" TEXT NOT NULL REFERENCES "Sale"("id") ON DELETE CASCADE,
  "method" "PaymentMethod" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "reference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "Payment_saleId_idx" ON "Payment"("saleId");

-- ============================================================
-- CreditAccount / CreditPayment
-- ============================================================
CREATE TABLE "CreditAccount" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "customerId" TEXT NOT NULL REFERENCES "Customer"("id") ON DELETE CASCADE,
  "saleId" TEXT NOT NULL UNIQUE REFERENCES "Sale"("id") ON DELETE CASCADE,
  "originalAmount" DECIMAL(12,2) NOT NULL,
  "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "dueDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "CreditAccount_customerId_idx" ON "CreditAccount"("customerId");

CREATE TABLE "CreditPayment" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "creditAccountId" TEXT NOT NULL REFERENCES "CreditAccount"("id") ON DELETE CASCADE,
  "amount" DECIMAL(12,2) NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "CreditPayment_creditAccountId_idx" ON "CreditPayment"("creditAccountId");

-- ============================================================
-- Expense
-- ============================================================
CREATE TABLE "Expense" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "branchId" TEXT REFERENCES "Branch"("id"),
  "createdById" TEXT REFERENCES "User"("id"),
  "category" "ExpenseCategory" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "description" TEXT,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "attachmentUrl" TEXT,
  "incurredAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "Expense_businessId_idx" ON "Expense"("businessId");
CREATE INDEX "Expense_branchId_idx" ON "Expense"("branchId");
CREATE INDEX "Expense_incurredAt_idx" ON "Expense"("incurredAt");

-- ============================================================
-- EmployeeShift
-- ============================================================
CREATE TABLE "EmployeeShift" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "branchId" TEXT NOT NULL REFERENCES "Branch"("id"),
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "endedAt" TIMESTAMP(3),
  "expectedCash" DECIMAL(12,2),
  "actualCash" DECIMAL(12,2),
  "variance" DECIMAL(12,2)
);
CREATE INDEX "EmployeeShift_userId_idx" ON "EmployeeShift"("userId");
CREATE INDEX "EmployeeShift_branchId_idx" ON "EmployeeShift"("branchId");

-- ============================================================
-- AuditLog / SyncRecord / Notification / BusinessInsight
-- ============================================================
CREATE TABLE "AuditLog" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "userId" TEXT REFERENCES "User"("id"),
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "previousValue" JSONB,
  "newValue" JSONB,
  "branchId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "AuditLog_businessId_idx" ON "AuditLog"("businessId");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

CREATE TABLE "SyncRecord" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "deviceId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "clientTxnId" TEXT NOT NULL,
  "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
  "conflictInfo" JSONB,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "resolvedAt" TIMESTAMP(3),
  UNIQUE ("businessId", "clientTxnId")
);
CREATE INDEX "SyncRecord_businessId_idx" ON "SyncRecord"("businessId");
CREATE INDEX "SyncRecord_status_idx" ON "SyncRecord"("status");

CREATE TABLE "Notification" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "branchId" TEXT,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "Notification_businessId_idx" ON "Notification"("businessId");
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

CREATE TABLE "BusinessInsight" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE,
  "category" TEXT NOT NULL,
  "tone" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "validUntil" TIMESTAMP(3)
);
CREATE INDEX "BusinessInsight_businessId_idx" ON "BusinessInsight"("businessId");
CREATE INDEX "BusinessInsight_category_idx" ON "BusinessInsight"("category");
