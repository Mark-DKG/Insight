-- Platform administration (9DEVs operators). Additive; touches no existing rows
-- except giving every business status ACTIVE.

CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'PLATFORM_ADMIN', 'TECHNICAL_ADMIN', 'SUPPORT_ADMIN', 'ANALYST');
CREATE TYPE "BusinessStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

ALTER TABLE "Business" ADD COLUMN "status" "BusinessStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Business" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "Business" ADD COLUMN "suspendedReason" TEXT;
CREATE INDEX "Business_status_idx" ON "Business"("status");
CREATE INDEX "Business_createdAt_idx" ON "Business"("createdAt");

CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "PlatformRole" NOT NULL,
    "extraPermissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mfaSecret" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");

CREATE TABLE "PlatformAdminSession" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "PlatformAdminSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlatformAdminSession_tokenHash_key" ON "PlatformAdminSession"("tokenHash");
CREATE INDEX "PlatformAdminSession_adminId_idx" ON "PlatformAdminSession"("adminId");
ALTER TABLE "PlatformAdminSession" ADD CONSTRAINT "PlatformAdminSession_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "PlatformAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Append-only platform audit trail. actorId is kept as plain text (no FK) so
-- history survives even if an admin record is ever removed.
CREATE TABLE "PlatformAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "targetBusinessId" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlatformAuditLog_createdAt_idx" ON "PlatformAuditLog"("createdAt");
CREATE INDEX "PlatformAuditLog_targetBusinessId_idx" ON "PlatformAuditLog"("targetBusinessId");
CREATE INDEX "PlatformAuditLog_actorId_idx" ON "PlatformAuditLog"("actorId");
CREATE INDEX "PlatformAuditLog_action_createdAt_idx" ON "PlatformAuditLog"("action", "createdAt");

-- Enforced in the database, not just the app: no UPDATE, DELETE or TRUNCATE
-- on the platform audit log, for any application user.
CREATE OR REPLACE FUNCTION platform_audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PlatformAuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PlatformAuditLog_no_update"
  BEFORE UPDATE OR DELETE ON "PlatformAuditLog"
  FOR EACH ROW EXECUTE FUNCTION platform_audit_log_immutable();
CREATE TRIGGER "PlatformAuditLog_no_truncate"
  BEFORE TRUNCATE ON "PlatformAuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION platform_audit_log_immutable();
