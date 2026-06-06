-- CreateTable AIAccessToken
CREATE TABLE "AIAccessToken" (
    "id" TEXT NOT NULL,
    "stampId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPrefix" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'license_verification',
    "licenseType" TEXT NOT NULL DEFAULT 'all-rights-reserved',
    "restrictions" TEXT NOT NULL,
    "metadata" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "verificationCount" INTEGER NOT NULL DEFAULT 0,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable AIRegistryMonitor
CREATE TABLE "AIRegistryMonitor" (
    "id" TEXT NOT NULL,
    "stampId" TEXT NOT NULL,
    "monitoringPlatforms" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastScanAt" TIMESTAMP(3),
    "nextScanAt" TIMESTAMP(3),
    "scanFrequency" TEXT NOT NULL DEFAULT 'weekly',
    "detectionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIRegistryMonitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable AITrainingDetection
CREATE TABLE "AITrainingDetection" (
    "id" TEXT NOT NULL,
    "registryMonitorId" TEXT NOT NULL,
    "stampId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelUrl" TEXT NOT NULL,
    "detectionMethod" TEXT NOT NULL,
    "confidence" DECIMAL(65,30) NOT NULL,
    "datasetName" TEXT,
    "datasetUrl" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportedAt" TIMESTAMP(3),
    "responseStatus" TEXT NOT NULL DEFAULT 'new',
    "platformResponse" TEXT,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AITrainingDetection_pkey" PRIMARY KEY ("id")
);

-- CreateTable AIModelAPIKey
CREATE TABLE "AIModelAPIKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "label" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIModelAPIKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable TrainingDataAudit
CREATE TABLE "TrainingDataAudit" (
    "id" TEXT NOT NULL,
    "stampId" TEXT NOT NULL,
    "auditType" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "detectionHash" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'high',
    "actionTaken" TEXT,
    "resolutionDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingDataAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AIAccessToken_tokenHash_key" ON "AIAccessToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "AIAccessToken_tokenPrefix_key" ON "AIAccessToken"("tokenPrefix");

-- CreateIndex
CREATE INDEX "AIAccessToken_stampId_idx" ON "AIAccessToken"("stampId");

-- CreateIndex
CREATE INDEX "AIAccessToken_expiresAt_idx" ON "AIAccessToken"("expiresAt");

-- CreateIndex
CREATE INDEX "AIRegistryMonitor_stampId_idx" ON "AIRegistryMonitor"("stampId");

-- CreateIndex
CREATE INDEX "AIRegistryMonitor_isActive_idx" ON "AIRegistryMonitor"("isActive");

-- CreateIndex
CREATE INDEX "AIRegistryMonitor_nextScanAt_idx" ON "AIRegistryMonitor"("nextScanAt");

-- CreateIndex
CREATE INDEX "AITrainingDetection_stampId_idx" ON "AITrainingDetection"("stampId");

-- CreateIndex
CREATE INDEX "AITrainingDetection_registryMonitorId_idx" ON "AITrainingDetection"("registryMonitorId");

-- CreateIndex
CREATE INDEX "AITrainingDetection_platform_idx" ON "AITrainingDetection"("platform");

-- CreateIndex
CREATE INDEX "AITrainingDetection_responseStatus_idx" ON "AITrainingDetection"("responseStatus");

-- CreateIndex
CREATE INDEX "AITrainingDetection_detectedAt_idx" ON "AITrainingDetection"("detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIModelAPIKey_keyHash_key" ON "AIModelAPIKey"("keyHash");

-- CreateIndex
CREATE INDEX "AIModelAPIKey_userId_idx" ON "AIModelAPIKey"("userId");

-- CreateIndex
CREATE INDEX "AIModelAPIKey_platform_idx" ON "AIModelAPIKey"("platform");

-- CreateIndex
CREATE INDEX "TrainingDataAudit_stampId_idx" ON "TrainingDataAudit"("stampId");

-- CreateIndex
CREATE INDEX "TrainingDataAudit_platform_idx" ON "TrainingDataAudit"("platform");

-- CreateIndex
CREATE INDEX "TrainingDataAudit_auditType_idx" ON "TrainingDataAudit"("auditType");

-- AddForeignKey
ALTER TABLE "AIAccessToken" ADD CONSTRAINT "AIAccessToken_stampId_fkey" FOREIGN KEY ("stampId") REFERENCES "Stamp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRegistryMonitor" ADD CONSTRAINT "AIRegistryMonitor_stampId_fkey" FOREIGN KEY ("stampId") REFERENCES "Stamp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AITrainingDetection" ADD CONSTRAINT "AITrainingDetection_registryMonitorId_fkey" FOREIGN KEY ("registryMonitorId") REFERENCES "AIRegistryMonitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AITrainingDetection" ADD CONSTRAINT "AITrainingDetection_stampId_fkey" FOREIGN KEY ("stampId") REFERENCES "Stamp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIModelAPIKey" ADD CONSTRAINT "AIModelAPIKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingDataAudit" ADD CONSTRAINT "TrainingDataAudit_stampId_fkey" FOREIGN KEY ("stampId") REFERENCES "Stamp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
