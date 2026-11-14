-- Insight Store reviews and reports.
CREATE TABLE "StoreReview" (
  "id" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "shopperId" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "listingId" TEXT,
  "orderId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "displayName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'VISIBLE',
  "hiddenReason" TEXT,
  "hiddenAt" TIMESTAMP(3),
  "hiddenByAdminId" TEXT,
  "sellerReply" TEXT,
  "sellerRepliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoreReview_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX "StoreReview_dedupeKey_key" ON "StoreReview"("dedupeKey");
CREATE INDEX "StoreReview_listingId_status_createdAt_idx" ON "StoreReview"("listingId", "status", "createdAt");
CREATE INDEX "StoreReview_businessId_kind_status_createdAt_idx" ON "StoreReview"("businessId", "kind", "status", "createdAt");
CREATE INDEX "StoreReview_shopperId_idx" ON "StoreReview"("shopperId");
ALTER TABLE "StoreReview" ADD CONSTRAINT "StoreReview_shopperId_fkey" FOREIGN KEY ("shopperId") REFERENCES "StoreShopper"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreReview" ADD CONSTRAINT "StoreReview_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreReview" ADD CONSTRAINT "StoreReview_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "StoreListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StoreReviewReport" (
  "id" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "reporterKey" TEXT NOT NULL,
  "reporterType" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreReviewReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoreReviewReport_reviewId_reporterKey_key" ON "StoreReviewReport"("reviewId", "reporterKey");
CREATE INDEX "StoreReviewReport_resolvedAt_createdAt_idx" ON "StoreReviewReport"("resolvedAt", "createdAt");
ALTER TABLE "StoreReviewReport" ADD CONSTRAINT "StoreReviewReport_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "StoreReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
