-- Legal 9.5: creator attestation, TSA tier, in-app notifications

ALTER TABLE "Stamp" ADD COLUMN IF NOT EXISTS "tsaTier" TEXT DEFAULT 'development';
ALTER TABLE "Stamp" ADD COLUMN IF NOT EXISTS "tsaProviderName" TEXT;
ALTER TABLE "Stamp" ADD COLUMN IF NOT EXISTS "creatorAttestationAt" TIMESTAMP(3);
ALTER TABLE "Stamp" ADD COLUMN IF NOT EXISTS "creatorAttestationName" TEXT;
ALTER TABLE "Stamp" ADD COLUMN IF NOT EXISTS "creatorAttestationStatement" TEXT;
ALTER TABLE "Stamp" ADD COLUMN IF NOT EXISTS "creatorDeclarationUrl" TEXT;

CREATE TABLE IF NOT EXISTS "UserNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UserNotification_userId_idx" ON "UserNotification"("userId");
CREATE INDEX IF NOT EXISTS "UserNotification_userId_read_idx" ON "UserNotification"("userId", "read");
CREATE INDEX IF NOT EXISTS "UserNotification_createdAt_idx" ON "UserNotification"("createdAt");

DO $$ BEGIN
  ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
