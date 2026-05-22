-- Legal proof stack: TSA metadata, 65B certificate URL, audit logs

ALTER TABLE "Stamp" ADD COLUMN IF NOT EXISTS "evidenceCertificateUrl" TEXT;
ALTER TABLE "Stamp" ADD COLUMN IF NOT EXISTS "tsaVerifyStatus" TEXT;
ALTER TABLE "Stamp" ADD COLUMN IF NOT EXISTS "tsaChainJson" TEXT;

CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "passportId" TEXT,
    "stampId" TEXT,
    "action" TEXT NOT NULL,
    "metadataJson" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_stampId_idx" ON "AuditLog"("stampId");
CREATE INDEX IF NOT EXISTS "AuditLog_passportId_idx" ON "AuditLog"("passportId");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
