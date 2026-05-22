-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "googleId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Passport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT,
    "displayName" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Passport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "passportId" TEXT NOT NULL,
    "name" TEXT,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stamp" (
    "id" TEXT NOT NULL,
    "passportId" TEXT NOT NULL,
    "originalHash" TEXT NOT NULL,
    "stampedHash" TEXT,
    "pHash" TEXT,
    "dHash" TEXT,
    "embedding" DOUBLE PRECISION[],
    "audioFingerprint" TEXT,
    "videoFingerprint" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "license" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'image',
    "fileType" TEXT NOT NULL,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "originalFileUrl" TEXT NOT NULL,
    "stampedFileUrl" TEXT,
    "thumbnailUrl" TEXT,
    "c2paManifestUrl" TEXT,
    "c2paEnabled" BOOLEAN NOT NULL DEFAULT true,
    "signature" TEXT NOT NULL,
    "certificateUrl" TEXT,
    "metadataJson" TEXT,
    "proofChain" TEXT,
    "tsaToken" BYTEA,
    "tsaUrl" TEXT,
    "tsaTimestamp" TIMESTAMP(3),
    "aiOptOut" BOOLEAN NOT NULL DEFAULT true,
    "monitorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stamp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StampVersion" (
    "id" TEXT NOT NULL,
    "stampId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "prevHash" TEXT,
    "chainHash" TEXT,
    "signature" TEXT,
    "fileUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "fileSize" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StampVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Monitor" (
    "id" TEXT NOT NULL,
    "passportId" TEXT NOT NULL,
    "stampId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "scanFrequency" TEXT NOT NULL DEFAULT 'weekly',
    "nextScanAt" TIMESTAMP(3),
    "lastScanAt" TIMESTAMP(3),
    "matchCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Monitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitorAlert" (
    "id" TEXT NOT NULL,
    "monitorId" TEXT NOT NULL,
    "stampId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceName" TEXT,
    "matchType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "screenshotUrl" TEXT,
    "sourceEngine" TEXT,
    "externalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitorAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Takedown" (
    "id" TEXT NOT NULL,
    "passportId" TEXT NOT NULL,
    "stampId" TEXT NOT NULL,
    "alertId" TEXT,
    "platform" TEXT NOT NULL,
    "infringingUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "dmcaLetter" TEXT,
    "submissionMethod" TEXT,
    "externalTicketId" TEXT,
    "responseDeadline" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "autoSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "filedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Takedown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockchainAnchor" (
    "id" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "merkleRoot" TEXT NOT NULL,
    "stampCount" INTEGER NOT NULL DEFAULT 0,
    "anchoredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockchainAnchor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StampAnchor" (
    "id" TEXT NOT NULL,
    "stampId" TEXT NOT NULL,
    "anchorId" TEXT NOT NULL,
    "merkleProof" TEXT NOT NULL,
    "leafHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StampAnchor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Passport_userId_key" ON "Passport"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Passport_username_key" ON "Passport"("username");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_passportId_idx" ON "ApiKey"("passportId");

-- CreateIndex
CREATE INDEX "Stamp_pHash_idx" ON "Stamp"("pHash");

-- CreateIndex
CREATE INDEX "Stamp_originalHash_idx" ON "Stamp"("originalHash");

-- CreateIndex
CREATE INDEX "Stamp_passportId_idx" ON "Stamp"("passportId");

-- CreateIndex
CREATE INDEX "Stamp_aiOptOut_idx" ON "Stamp"("aiOptOut");

-- CreateIndex
CREATE INDEX "StampVersion_stampId_idx" ON "StampVersion"("stampId");

-- CreateIndex
CREATE UNIQUE INDEX "StampVersion_stampId_version_key" ON "StampVersion"("stampId", "version");

-- CreateIndex
CREATE INDEX "Monitor_status_idx" ON "Monitor"("status");

-- CreateIndex
CREATE INDEX "Monitor_nextScanAt_idx" ON "Monitor"("nextScanAt");

-- CreateIndex
CREATE UNIQUE INDEX "Monitor_passportId_stampId_key" ON "Monitor"("passportId", "stampId");

-- CreateIndex
CREATE INDEX "MonitorAlert_monitorId_idx" ON "MonitorAlert"("monitorId");

-- CreateIndex
CREATE INDEX "MonitorAlert_stampId_idx" ON "MonitorAlert"("stampId");

-- CreateIndex
CREATE INDEX "MonitorAlert_status_idx" ON "MonitorAlert"("status");

-- CreateIndex
CREATE INDEX "MonitorAlert_externalId_idx" ON "MonitorAlert"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Takedown_alertId_key" ON "Takedown"("alertId");

-- CreateIndex
CREATE INDEX "Takedown_passportId_idx" ON "Takedown"("passportId");

-- CreateIndex
CREATE INDEX "Takedown_stampId_idx" ON "Takedown"("stampId");

-- CreateIndex
CREATE INDEX "Takedown_status_idx" ON "Takedown"("status");

-- CreateIndex
CREATE INDEX "Takedown_responseDeadline_idx" ON "Takedown"("responseDeadline");

-- CreateIndex
CREATE INDEX "BlockchainAnchor_merkleRoot_idx" ON "BlockchainAnchor"("merkleRoot");

-- CreateIndex
CREATE INDEX "StampAnchor_stampId_idx" ON "StampAnchor"("stampId");

-- CreateIndex
CREATE UNIQUE INDEX "StampAnchor_stampId_anchorId_key" ON "StampAnchor"("stampId", "anchorId");

-- AddForeignKey
ALTER TABLE "Passport" ADD CONSTRAINT "Passport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_passportId_fkey" FOREIGN KEY ("passportId") REFERENCES "Passport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stamp" ADD CONSTRAINT "Stamp_passportId_fkey" FOREIGN KEY ("passportId") REFERENCES "Passport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StampVersion" ADD CONSTRAINT "StampVersion_stampId_fkey" FOREIGN KEY ("stampId") REFERENCES "Stamp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Monitor" ADD CONSTRAINT "Monitor_passportId_fkey" FOREIGN KEY ("passportId") REFERENCES "Passport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Monitor" ADD CONSTRAINT "Monitor_stampId_fkey" FOREIGN KEY ("stampId") REFERENCES "Stamp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorAlert" ADD CONSTRAINT "MonitorAlert_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitorAlert" ADD CONSTRAINT "MonitorAlert_stampId_fkey" FOREIGN KEY ("stampId") REFERENCES "Stamp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Takedown" ADD CONSTRAINT "Takedown_passportId_fkey" FOREIGN KEY ("passportId") REFERENCES "Passport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Takedown" ADD CONSTRAINT "Takedown_stampId_fkey" FOREIGN KEY ("stampId") REFERENCES "Stamp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Takedown" ADD CONSTRAINT "Takedown_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "MonitorAlert"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StampAnchor" ADD CONSTRAINT "StampAnchor_stampId_fkey" FOREIGN KEY ("stampId") REFERENCES "Stamp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StampAnchor" ADD CONSTRAINT "StampAnchor_anchorId_fkey" FOREIGN KEY ("anchorId") REFERENCES "BlockchainAnchor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

