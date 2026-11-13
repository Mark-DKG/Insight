-- Transactional email: verification tokens, delivery records, webhook idempotency, platform email settings.
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

CREATE TABLE "EmailVerificationToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EmailMessage" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "template" TEXT NOT NULL,
  "toAddress" TEXT NOT NULL,
  "businessId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "providerId" TEXT,
  "lastError" TEXT,
  "payload" JSONB,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailMessage_idempotencyKey_key" ON "EmailMessage"("idempotencyKey");
CREATE UNIQUE INDEX "EmailMessage_providerId_key" ON "EmailMessage"("providerId");
CREATE INDEX "EmailMessage_status_nextAttemptAt_idx" ON "EmailMessage"("status", "nextAttemptAt");
CREATE INDEX "EmailMessage_category_createdAt_idx" ON "EmailMessage"("category", "createdAt");
CREATE INDEX "EmailMessage_createdAt_idx" ON "EmailMessage"("createdAt");

CREATE TABLE "EmailWebhookEvent" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailSetting" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "centralAddress" TEXT,
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailSetting_pkey" PRIMARY KEY ("id")
);
