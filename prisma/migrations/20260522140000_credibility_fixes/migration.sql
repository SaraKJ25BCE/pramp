ALTER TABLE "Stamp" ADD COLUMN IF NOT EXISTS "creatorAttestationCity" TEXT;
ALTER TABLE "Stamp" ADD COLUMN IF NOT EXISTS "creatorAttestationCountry" TEXT;
ALTER TABLE "Stamp" ADD COLUMN IF NOT EXISTS "tsaStatus" TEXT DEFAULT 'pending';

ALTER TABLE "BlockchainAnchor" ADD COLUMN IF NOT EXISTS "blockchainStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "BlockchainAnchor" ADD COLUMN IF NOT EXISTS "otsPendingBytes" BYTEA;
ALTER TABLE "BlockchainAnchor" ADD COLUMN IF NOT EXISTS "otsConfirmedBytes" BYTEA;
ALTER TABLE "BlockchainAnchor" ADD COLUMN IF NOT EXISTS "auditHeadHash" TEXT;
