const express = require('express');
const prisma = require('../config/prisma');
const { exportAuditChain } = require('../services/auditLog');
const { buildVerifyInstructions } = require('../utils/verifyInstructions');
const { formatAnchorsForProof } = require('../services/blockchainProof');
const { verifyAttestation } = require('../services/creatorAttestation');
const { hasCreatorAttestation, getTsaDisplayMeta } = require('../config/legalProof');
const { verifyStampSignature } = require('../services/stampVerify');

const router = express.Router();

function getBaseUrl(req) {
  return process.env.SERVER_URL || `${req.protocol}://${req.get('host')}`;
}

router.get('/:stampId', async (req, res) => {
  try {
    const stamp = await prisma.stamp.findUnique({
      where: { id: req.params.stampId },
      include: {
        passport: {
          select: { id: true, username: true, displayName: true, publicKey: true },
        },
        stampAnchors: { include: { anchor: true } },
      },
    });

    if (!stamp) {
      return res.status(404).json({ error: 'Stamp not found', stamp_id: req.params.stampId });
    }

    const baseUrl = getBaseUrl(req);
    const sigResult = verifyStampSignature(stamp, stamp.passport);
    const auditExport = await exportAuditChain(stamp.id);

    let creatorAttestation = null;
    if (stamp.creatorAttestationPayload && stamp.creatorAttestationSignature) {
      const verified = verifyAttestation(
        stamp.passport.publicKey,
        stamp.creatorAttestationPayload,
        stamp.creatorAttestationSignature
      );
      creatorAttestation = {
        full_name: stamp.creatorAttestationName,
        city: stamp.creatorAttestationCity,
        country: stamp.creatorAttestationCountry,
        attested_at: stamp.creatorAttestationAt?.toISOString(),
        payload: stamp.creatorAttestationPayload,
        rsa_signature: stamp.creatorAttestationSignature,
        verified,
        cryptographically_bound: verified,
      };
    }

    res.json({
      stamp_id: stamp.id,
      original_hash: stamp.originalHash,
      creator_username: stamp.passport.username ? `@${stamp.passport.username}` : null,
      creator_display_name: stamp.passport.displayName,
      registered_at: stamp.createdAt.toISOString(),
      rsa_signature: stamp.signature,
      public_key: stamp.passport.publicKey,
      signature_valid: sigResult.verified,
      tsa_status: stamp.tsaStatus || (stamp.tsaToken ? 'confirmed' : 'pending'),
      tsa: stamp.tsaToken
        ? {
            provider: stamp.tsaProviderName,
            tier: stamp.tsaTier,
            timestamp: stamp.tsaTimestamp?.toISOString(),
            verify_status: stamp.tsaVerifyStatus,
            token_url: `${baseUrl}/tsa/token/${stamp.id}`,
            verify_url: `${baseUrl}/tsa/verify/${stamp.id}`,
          }
        : null,
      blockchain_status:
        formatAnchorsForProof(stamp.stampAnchors).length > 0 ? 'confirmed' : 'pending',
      creator_attestation: creatorAttestation,
      creator_attestation_complete: hasCreatorAttestation(stamp),
      blockchain_anchors: formatAnchorsForProof(stamp.stampAnchors),
      audit_chain_head_hash: auditExport.verification.headHash,
      audit_chain_valid: auditExport.verification.valid,
      system_certificate_url: stamp.evidenceCertificateUrl,
      section63_certificate_url: stamp.evidenceCertificateUrl,
      audit_log_hash: auditExport.verification.headHash,
      proof_bundle_url: `${baseUrl}/stamps/${stamp.id}/proof`,
      verify_instructions: buildVerifyInstructions(baseUrl, stamp.id),
      tsa_display: getTsaDisplayMeta(),
    });
  } catch (err) {
    console.error('API verify error:', err);
    res.status(500).json({ error: 'Verification API failed' });
  }
});

module.exports = router;
