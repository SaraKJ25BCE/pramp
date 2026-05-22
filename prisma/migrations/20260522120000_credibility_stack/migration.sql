-- Credibility stack: RSA attestation + hash-chained audit

ALTER TABLE "Stamp" ADD COLUMN IF NOT EXISTS "creatorAttestationPayload" TEXT;
ALTER TABLE "Stamp" ADD COLUMN IF NOT EXISTS "creatorAttestationSignature" TEXT;

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "userAgent" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "previousLogHash" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "entryHash" TEXT;

-- Backfill entryHash for existing rows without chain
UPDATE "AuditLog" SET "entryHash" = encode(sha256(("id" || "action" || COALESCE("stampId",'') || "createdAt"::text)::bytea), 'hex')
WHERE "entryHash" IS NULL;

ALTER TABLE "AuditLog" ALTER COLUMN "entryHash" SET NOT NULL;
