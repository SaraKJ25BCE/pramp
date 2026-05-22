const prisma = require('../config/prisma');
const { getTimestampToken, verifyTimestampTokenFull } = require('../services/timestamping');
const { resolveTsaTier, TSA_PROVIDER_NAME } = require('../config/legalProof');
const { bumpTsaCallCount } = require('../services/tsaMetrics');
const { generateSystem63Pdf, saveEvidencePdf } = require('../services/legalEvidence');
const { isLegalProofEnabled } = require('../config/legalProof');

const RETRY_INTERVAL_MS = parseInt(process.env.TSA_RETRY_INTERVAL_MS || '900000', 10);
const BATCH_SIZE = parseInt(process.env.TSA_RETRY_BATCH_SIZE || '20', 10);

function parseMetadata(stamp) {
  try {
    return stamp.metadataJson ? JSON.parse(stamp.metadataJson) : {};
  } catch {
    return {};
  }
}

async function retryPendingTsa() {
  const stamps = await prisma.stamp.findMany({
    where: {
      OR: [{ tsaToken: null }, { tsaStatus: 'pending' }],
    },
    take: BATCH_SIZE,
    orderBy: { createdAt: 'asc' },
    include: {
      passport: { select: { id: true, displayName: true, username: true, userId: true } },
    },
  });

  for (const stamp of stamps) {
    const meta = parseMetadata(stamp);
    if (!meta.tsaPending) continue;

    try {
      bumpTsaCallCount();
      const tsa = await getTimestampToken(stamp.originalHash);
      const tokenBuf = tsa.tsToken;
      const verify = verifyTimestampTokenFull(tokenBuf, stamp.originalHash);

      const updatedMeta = { ...meta, tsaPending: false };
      await prisma.stamp.update({
        where: { id: stamp.id },
        data: {
          tsaToken: tokenBuf,
          tsaUrl: tsa.tsaUrl,
          tsaTimestamp: tsa.timestamp,
          tsaVerifyStatus: verify.valid ? 'valid' : 'invalid',
          tsaStatus: 'confirmed',
          tsaChainJson: tsa.signerInfo ? JSON.stringify(tsa.signerInfo) : null,
          tsaTier: resolveTsaTier(),
          tsaProviderName: tsa.tsaProviderName || TSA_PROVIDER_NAME,
          metadataJson: JSON.stringify(updatedMeta),
        },
      });

      if (isLegalProofEnabled() && !stamp.evidenceCertificateUrl) {
        const user = await prisma.user.findUnique({
          where: { id: stamp.passport.userId },
          select: { email: true },
        });
        const fresh = await prisma.stamp.findUnique({ where: { id: stamp.id } });
        const system63Buffer = await generateSystem63Pdf(fresh, stamp.passport, user);
        const evidenceUrl = await saveEvidencePdf(system63Buffer, stamp.id, 'evidence', 'bsa-section63-system');
        await prisma.stamp.update({
          where: { id: stamp.id },
          data: { evidenceCertificateUrl: evidenceUrl },
        });
      }
    } catch (err) {
      console.warn(`[TSA retry] ${stamp.id}: ${err.message}`);
    }
  }
}

function startTsaRetryJob() {
  if (process.env.TSA_RETRY_DISABLED === 'true') return;
  setInterval(() => {
    retryPendingTsa().catch((err) => console.error('[TSA retry] job error:', err));
  }, RETRY_INTERVAL_MS);
  retryPendingTsa().catch((err) => console.error('[TSA retry] initial run:', err));
}

module.exports = { startTsaRetryJob, retryPendingTsa };
