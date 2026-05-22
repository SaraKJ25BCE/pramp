const express = require('express');
const authMiddleware = require('../middleware/auth');
const prisma = require('../config/prisma');
const { logAudit } = require('../services/auditLog');
const {
  getTimestampToken,
  verifyTimestampTokenFull,
  getTsaVerifyInstructions,
} = require('../services/timestamping');
const { requiresTsaOnStamp } = require('../config/legalProof');

const router = express.Router();

function normalizeTsaToken(stamp) {
  if (!stamp.tsaToken) return null;
  return Buffer.isBuffer(stamp.tsaToken) ? stamp.tsaToken : Buffer.from(stamp.tsaToken);
}

router.post('/anchor/:stampId', authMiddleware, async (req, res) => {
  try {
    const passport = await prisma.passport.findUnique({ where: { userId: req.user.userId } });
    if (!passport) return res.status(404).json({ error: 'Passport not found' });

    const stamp = await prisma.stamp.findUnique({ where: { id: req.params.stampId } });
    if (!stamp) return res.status(404).json({ error: 'Stamp not found' });
    if (stamp.passportId !== passport.id) return res.status(403).json({ error: 'Not your stamp' });

    if (stamp.tsaToken) {
      return res.json({
        message: 'Stamp already has a TSA timestamp',
        tsaUrl: stamp.tsaUrl,
        tsaTimestamp: stamp.tsaTimestamp,
        tsaVerifyStatus: stamp.tsaVerifyStatus,
      });
    }

    const tsa = await getTimestampToken(stamp.originalHash);
    const verify = verifyTimestampTokenFull(tsa.tsToken, stamp.originalHash);

    const updated = await prisma.stamp.update({
      where: { id: stamp.id },
      data: {
        tsaToken: tsa.tsToken,
        tsaUrl: tsa.tsaUrl,
        tsaTimestamp: tsa.timestamp,
        tsaVerifyStatus: verify.valid ? 'valid' : 'invalid',
        tsaChainJson: tsa.signerInfo ? JSON.stringify(tsa.signerInfo) : null,
      },
    });

    await logAudit(req, { action: 'TSA_ANCHORED_MANUAL', stampId: stamp.id, passportId: passport.id });

    res.json({
      message: 'RFC 3161 timestamp anchored successfully',
      stampId: stamp.id,
      tsaUrl: updated.tsaUrl,
      tsaTimestamp: updated.tsaTimestamp,
      tsaVerifyStatus: updated.tsaVerifyStatus,
      verification: verify,
    });
  } catch (error) {
    console.error('TSA anchor error:', error.message);
    res.status(500).json({ error: 'Failed to anchor timestamp', detail: error.message });
  }
});

router.get('/verify/:stampId', async (req, res) => {
  try {
    const stamp = await prisma.stamp.findUnique({
      where: { id: req.params.stampId },
      select: {
        id: true,
        originalHash: true,
        tsaToken: true,
        tsaUrl: true,
        tsaTimestamp: true,
        tsaVerifyStatus: true,
        tsaChainJson: true,
      },
    });

    if (!stamp) return res.status(404).json({ error: 'Stamp not found' });

    if (!stamp.tsaToken) {
      return res.json({
        stampId: stamp.id,
        anchored: false,
        message: 'No TSA timestamp found for this stamp',
        requiredOnNewStamps: requiresTsaOnStamp(),
      });
    }

    const tokenBuf = normalizeTsaToken(stamp);
    const verify = verifyTimestampTokenFull(tokenBuf, stamp.originalHash);

    if (verify.valid && stamp.tsaVerifyStatus !== 'valid') {
      await prisma.stamp.update({
        where: { id: stamp.id },
        data: { tsaVerifyStatus: 'valid' },
      });
    } else if (!verify.valid && stamp.tsaVerifyStatus !== 'invalid') {
      await prisma.stamp.update({
        where: { id: stamp.id },
        data: { tsaVerifyStatus: 'invalid' },
      });
    }

    res.json({
      stampId: stamp.id,
      anchored: true,
      valid: verify.valid,
      protocol: 'RFC 3161',
      tsaUrl: stamp.tsaUrl,
      tsaTimestamp: stamp.tsaTimestamp,
      fileHash: stamp.originalHash,
      messageImprint: verify.messageImprint,
      messageImprintMatch: verify.messageImprintMatch,
      signatureVerified: verify.signatureVerified,
      signatureVerifyNote: verify.signatureVerifyNote,
      signer: verify.signer,
      tsaChain: stamp.tsaChainJson ? JSON.parse(stamp.tsaChainJson) : null,
      independentVerifyInstructions: getTsaVerifyInstructions().replace(/\{stampId\}/g, stamp.id),
    });
  } catch (error) {
    console.error('TSA verify error:', error.message);
    res.status(500).json({ error: 'Failed to verify timestamp' });
  }
});

router.get('/token/:stampId', async (req, res) => {
  try {
    const stamp = await prisma.stamp.findUnique({
      where: { id: req.params.stampId },
      select: { id: true, tsaToken: true },
    });

    if (!stamp || !stamp.tsaToken) {
      return res.status(404).json({ error: 'No TSA token found' });
    }

    await logAudit(req, {
      action: 'TSA_TOKEN_DOWNLOADED',
      stampId: stamp.id,
    });

    const tokenBuf = normalizeTsaToken(stamp);
    res.setHeader('Content-Type', 'application/timestamp-reply');
    res.setHeader('Content-Disposition', `attachment; filename="${stamp.id}-tsa-token.tsr"`);
    res.send(tokenBuf);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve token' });
  }
});

module.exports = router;
