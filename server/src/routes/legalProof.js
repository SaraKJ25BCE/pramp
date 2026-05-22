const express = require('express');
const authOrApiKey = require('../middleware/authOrApiKey');
const prisma = require('../config/prisma');
const { decryptPrivateKey } = require('../utils/crypto');
const { logAudit, exportAuditChain, buildAuditChainVerificationText } = require('../services/auditLog');
const {
  isLegalProofEnabled,
  SYSTEM_ATTESTATION,
  hasCreatorAttestation,
  needsReattestation,
  CREATOR_ATTESTATION_VERSION,
  CREATOR_ATTESTATION_TEXT,
  MARKETING,
} = require('../config/legalProof');
const {
  buildAttestationPayload,
  signAttestation,
  buildAttestationRecord,
  payloadSha256,
} = require('../services/creatorAttestation');
const {
  generateSystem63Pdf,
  generateCreatorDeclarationPdf,
  buildArtifactsList,
  buildLitigationPackZip,
  saveEvidencePdf,
} = require('../services/legalEvidence');
const { buildVerifyInstructions } = require('../utils/verifyInstructions');

const router = express.Router();

function getBaseUrl(req) {
  return process.env.SERVER_URL || `${req.protocol}://${req.get('host')}`;
}

async function loadStampForUser(stampId, userId) {
  const passport = await prisma.passport.findUnique({ where: { userId } });
  if (!passport) return { error: 'Passport not found', status: 404 };

  const stamp = await prisma.stamp.findUnique({
    where: { id: stampId },
    include: {
      passport: {
        select: {
          id: true,
          username: true,
          displayName: true,
          publicKey: true,
          privateKey: true,
          userId: true,
        },
      },
    },
  });

  if (!stamp) return { error: 'Stamp not found', status: 404 };
  if (stamp.passportId !== passport.id) return { error: 'Not your stamp', status: 403 };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, plan: true },
  });

  return { stamp, passport: stamp.passport, user, passportId: passport.id };
}

function buildProofBundleJson(stamp, passport, baseUrl, extra = {}) {
  const attestation =
    stamp.creatorAttestationAt && stamp.creatorAttestationSignature
      ? {
          name: stamp.creatorAttestationName,
          at: stamp.creatorAttestationAt.toISOString(),
          statementVersion: stamp.creatorAttestationStatement,
          payload: stamp.creatorAttestationPayload,
          signature: stamp.creatorAttestationSignature,
          algorithm: 'RSA-SHA256',
          verified: true,
        }
      : stamp.creatorAttestationAt
        ? { legacy: true, reattestRequired: true }
        : null;

  return {
    version: '3.0',
    stampId: stamp.id,
    creator: {
      passportId: passport.id,
      username: passport.username,
      displayName: passport.displayName,
      attestation,
    },
    file: {
      name: stamp.fileName,
      type: stamp.fileType,
      category: stamp.category,
      size: stamp.fileSize,
      sha256: stamp.originalHash,
    },
    protection: {
      signature: stamp.signature,
      publicKey: passport.publicKey,
      timestamp: stamp.createdAt.toISOString(),
      proofChain: stamp.proofChain ? JSON.parse(stamp.proofChain) : null,
    },
    trustedTimestamp: stamp.tsaToken
      ? {
          tsaUrl: stamp.tsaUrl,
          tsaTier: stamp.tsaTier,
          tsaProvider: stamp.tsaProviderName,
          timestamp: stamp.tsaTimestamp?.toISOString() || null,
          verifyStatus: stamp.tsaVerifyStatus,
          tsaChain: stamp.tsaChainJson ? JSON.parse(stamp.tsaChainJson) : null,
        }
      : null,
    keyCustody: {
      algorithm: 'RSA-2048',
      publicKeyOnRecord: true,
      privateKeyStorage: 'aes-256-gcm-encrypted-at-rest',
      exportableByCreator: true,
      exportEndpoint: `${baseUrl}/passport/me/export-private-key`,
    },
    systemAttestation: SYSTEM_ATTESTATION,
    verification: {
      url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/verify?id=${stamp.id}`,
    },
    section63SystemCertificateUrl: stamp.evidenceCertificateUrl,
    creatorDeclarationUrl: stamp.creatorDeclarationUrl,
    certificateUrl: stamp.certificateUrl,
    auditChainHeadHash: extra.auditChainHeadHash || null,
    verifyInstructions: buildVerifyInstructions(baseUrl, stamp.id),
  };
}

router.get('/:stampId/artifacts', async (req, res) => {
  try {
    const stamp = await prisma.stamp.findUnique({
      where: { id: req.params.stampId },
      include: { passport: { select: { id: true, username: true, displayName: true } } },
    });
    if (!stamp) return res.status(404).json({ error: 'Stamp not found' });

    res.json(buildArtifactsList(stamp, stamp.passport, getBaseUrl(req)));
  } catch (err) {
    console.error('Artifacts error:', err);
    res.status(500).json({ error: 'Failed to list artifacts' });
  }
});

async function serveSystemCertificate(req, res) {
  try {
    const stamp = await prisma.stamp.findUnique({
      where: { id: req.params.stampId },
      include: { passport: { select: { id: true, username: true, displayName: true, userId: true } } },
    });
    if (!stamp) return res.status(404).json({ error: 'Stamp not found' });

    await logAudit(req, {
      action: 'CERTIFICATE_DOWNLOADED',
      stampId: stamp.id,
      passportId: stamp.passportId,
    });

    if (stamp.evidenceCertificateUrl) {
      return res.redirect(stamp.evidenceCertificateUrl);
    }

    const user = await prisma.user.findUnique({
      where: { id: stamp.passport.userId },
      select: { email: true },
    });

    const auditExport = await exportAuditChain(stamp.id);
    const pdf = await generateSystem63Pdf(stamp, stamp.passport, user, {
      auditHeadHash: auditExport.verification.headHash,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${stamp.id}-bsa-section63-system.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error('System certificate download error:', err);
    res.status(500).json({ error: 'Failed to generate system certificate' });
  }
}

router.get('/:stampId/system-certificate', serveSystemCertificate);
router.get('/:stampId/section-65b', (req, res) => {
  res.redirect(301, `${req.baseUrl}/${req.params.stampId}/system-certificate`);
});

router.get('/:stampId/creator-declaration', async (req, res) => {
  try {
    const stamp = await prisma.stamp.findUnique({
      where: { id: req.params.stampId },
      include: { passport: { select: { id: true, username: true, displayName: true, userId: true } } },
    });
    if (!stamp) return res.status(404).json({ error: 'Stamp not found' });

    if (!hasCreatorAttestation(stamp)) {
      return res.status(403).json({
        error: 'Creator attestation required',
        code: needsReattestation(stamp) ? 'REATTEST_REQUIRED' : 'ATTESTATION_REQUIRED',
        message: 'Complete cryptographically signed creator declaration before download.',
      });
    }

    if (stamp.creatorDeclarationUrl) {
      return res.redirect(stamp.creatorDeclarationUrl);
    }

    const user = await prisma.user.findUnique({
      where: { id: stamp.passport.userId },
      select: { email: true },
    });

    const pdf = await generateCreatorDeclarationPdf(stamp, stamp.passport, user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${stamp.id}-creator-declaration.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error('Creator declaration error:', err);
    res.status(500).json({ error: 'Failed to generate creator declaration' });
  }
});

router.post('/:stampId/attest', authOrApiKey, async (req, res) => {
  try {
    if (!isLegalProofEnabled()) {
      return res.status(503).json({ error: 'Legal proof features are disabled' });
    }

    const { fullName, confirm, statementConfirm, statementVersion, city, country } = req.body || {};
    if (!confirm || confirm !== true || !statementConfirm || statementConfirm !== true) {
      return res.status(400).json({
        error: 'You must confirm the declaration (confirm: true) and the authorship statement (statementConfirm: true)',
      });
    }
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      return res.status(400).json({ error: 'fullName is required' });
    }
    if (!city || typeof city !== 'string' || city.trim().length < 2) {
      return res.status(400).json({ error: 'city is required' });
    }
    if (!country || typeof country !== 'string' || country.trim().length < 2) {
      return res.status(400).json({ error: 'country is required' });
    }

    const version = statementVersion || CREATOR_ATTESTATION_VERSION;
    if (version !== CREATOR_ATTESTATION_VERSION) {
      return res.status(400).json({
        error: `Unsupported statement version. Use "${CREATOR_ATTESTATION_VERSION}".`,
      });
    }

    const loaded = await loadStampForUser(req.params.stampId, req.user.userId);
    if (loaded.error) return res.status(loaded.status).json({ error: loaded.error });

    const { stamp, passport, user } = loaded;

    const trimmedName = fullName.trim();
    const attestedAt = new Date();
    const payload = buildAttestationPayload(
      stamp,
      passport.id,
      { fullName: trimmedName, city: city.trim(), country: country.trim() },
      version,
      attestedAt
    );
    const privateKeyPem = decryptPrivateKey(passport.privateKey, {
      userId: req.user.userId,
      passportId: passport.id,
    });
    const signature = signAttestation(privateKeyPem, payload);

    const stampForPdf = {
      ...stamp,
      creatorAttestationName: trimmedName,
      creatorAttestationAt: attestedAt,
      creatorAttestationStatement: version,
      creatorAttestationPayload: payload,
      creatorAttestationSignature: signature,
    };

    const declarationBuffer = await generateCreatorDeclarationPdf(stampForPdf, passport, user);
    const declarationUrl = await saveEvidencePdf(
      declarationBuffer,
      stamp.id,
      'evidence',
      'creator-declaration'
    );

    const updated = await prisma.stamp.update({
      where: { id: stamp.id },
      data: {
        creatorAttestationAt: attestedAt,
        creatorAttestationName: trimmedName,
        creatorAttestationStatement: version,
        creatorAttestationPayload: payload,
        creatorAttestationSignature: signature,
        creatorAttestationCity: city.trim(),
        creatorAttestationCountry: country.trim(),
        creatorDeclarationUrl: declarationUrl,
      },
    });

    await logAudit(req, {
      action: 'CREATOR_ATTESTED',
      stampId: stamp.id,
      passportId: passport.id,
      userId: req.user.userId,
      metadata: {
        statementVersion: version,
        payloadSha256: payloadSha256(payload),
        accountEmail: user?.email,
      },
    });

    res.json({
      attested: true,
      cryptographicallyBound: true,
      creatorAttestationAt: updated.creatorAttestationAt,
      creatorDeclarationUrl: updated.creatorDeclarationUrl,
      statement: CREATOR_ATTESTATION_TEXT,
      statementVersion: version,
      counselPacketAvailable: true,
    });
  } catch (err) {
    console.error('Attest error:', err);
    res.status(500).json({ error: 'Failed to record creator attestation' });
  }
});

router.get('/:stampId/litigation-pack', authOrApiKey, async (req, res) => {
  try {
    if (!isLegalProofEnabled()) {
      return res.status(503).json({ error: 'Legal proof features are disabled' });
    }

    const loaded = await loadStampForUser(req.params.stampId, req.user.userId);
    if (loaded.error) return res.status(loaded.status).json({ error: loaded.error });

    const { stamp, passport, user } = loaded;

    if (!hasCreatorAttestation(stamp)) {
      return res.status(403).json({
        error: 'Creator attestation required',
        code: needsReattestation(stamp) ? 'REATTEST_REQUIRED' : 'ATTESTATION_REQUIRED',
        message: `Complete cryptographically signed creator declaration before downloading the ${MARKETING.counselPacketName}.`,
        attestEndpoint: `/legal/${stamp.id}/attest`,
      });
    }

    const baseUrl = getBaseUrl(req);
    const auditExport = await exportAuditChain(stamp.id);
    const auditVerificationText = buildAuditChainVerificationText(auditExport);

    const attestationRecord = buildAttestationRecord(
      stamp,
      passport,
      stamp.creatorAttestationPayload,
      stamp.creatorAttestationSignature
    );

    const system63Buffer = await generateSystem63Pdf(stamp, passport, user, {
      auditHeadHash: auditExport.verification.headHash,
    });
    const creatorDeclarationBuffer = await generateCreatorDeclarationPdf(stamp, passport, user);
    const proofBundle = buildProofBundleJson(stamp, passport, baseUrl, {
      auditChainHeadHash: auditExport.verification.headHash,
    });
    const zipBuffer = await buildLitigationPackZip(stamp, passport, user, proofBundle, {
      systemCertBuffer: system63Buffer,
      creatorDeclarationBuffer,
      baseUrl,
      attestationRecord,
      auditChainExport: auditExport,
      auditChainVerificationText: auditVerificationText,
    });

    await logAudit(req, {
      action: 'COUNSEL_PACKET_DOWNLOADED',
      stampId: stamp.id,
      passportId: passport.id,
      userId: req.user.userId,
    });

    const filename = `${stamp.id}-${MARKETING.counselPacketFilenameSuffix}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(zipBuffer);
  } catch (err) {
    console.error('Counsel packet error:', err);
    res.status(500).json({ error: 'Failed to build counsel evidence packet' });
  }
});

module.exports = router;
