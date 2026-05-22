const crypto = require('crypto');
const { verifySignature } = require('../utils/crypto');

function verifyStampSignature(stamp, passport) {
  if (!stamp.metadataJson) return { verified: false, reason: 'no metadata' };

  try {
    const metadata = JSON.parse(stamp.metadataJson);
    if (metadata.signPayload) {
      return {
        verified: verifySignature(metadata.signPayload, stamp.signature, passport.publicKey),
        payload: metadata.signPayload,
      };
    }
  } catch (e) {}

  const possiblePayloads = [
    `${stamp.id}|${stamp.passportId}|${stamp.originalHash}|${stamp.createdAt.toISOString()}`,
  ];

  for (const payload of possiblePayloads) {
    if (verifySignature(payload, stamp.signature, passport.publicKey)) {
      return { verified: true, payload };
    }
  }

  return { verified: false, reason: 'signature mismatch' };
}

function verifyProofChain(stamp) {
  if (!stamp.proofChain) return { valid: false, reason: 'no proof chain' };

  try {
    const chain = JSON.parse(stamp.proofChain);
    const { blockHash, ...block } = chain;
    const computedHash = crypto.createHash('sha256')
      .update(JSON.stringify(block))
      .digest('hex');
    return { valid: computedHash === blockHash, blockHash, computedHash };
  } catch (e) {
    return { valid: false, reason: e.message };
  }
}

module.exports = { verifyStampSignature, verifyProofChain };
