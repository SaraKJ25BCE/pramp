const crypto = require('crypto');
const { signData, verifySignature } = require('../utils/crypto');
const { CREATOR_ATTESTATION_VERSION, CREATOR_ATTESTATION_STATEMENT } = require('../config/legalProof');

function buildAttestationPayload(stamp, passportId, fields, statementVersion, attestedAt) {
  const {
    fullName,
    city,
    country,
    statementText = CREATOR_ATTESTATION_STATEMENT,
  } = fields;
  const iso = attestedAt instanceof Date ? attestedAt.toISOString() : String(attestedAt);
  const version = statementVersion || CREATOR_ATTESTATION_VERSION;
  const statementHash = crypto.createHash('sha256').update(statementText, 'utf8').digest('hex');

  if (version === '2.0') {
    return [
      'ATTEST',
      'v2',
      stamp.id,
      passportId,
      stamp.originalHash,
      version,
      fullName.trim(),
      (city || '').trim(),
      (country || '').trim(),
      statementHash,
      iso,
    ].join('|');
  }

  return [
    'ATTEST',
    'v1',
    stamp.id,
    passportId,
    stamp.originalHash,
    version,
    fullName.trim(),
    iso,
  ].join('|');
}

function signAttestation(privateKeyPem, payload) {
  return signData(payload, privateKeyPem);
}

function verifyAttestation(publicKeyPem, payload, signature) {
  if (!payload || !signature || !publicKeyPem) return false;
  return verifySignature(payload, signature, publicKeyPem);
}

function payloadSha256(payload) {
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

function buildAttestationRecord(stamp, passport, payload, signature) {
  const verified = verifyAttestation(passport.publicKey, payload, signature);
  return {
    version: '2.0',
    stampId: stamp.id,
    passportId: passport.id,
    payload,
    signature,
    algorithm: 'RSA-SHA256',
    verified,
    creatorAttestationName: stamp.creatorAttestationName,
    creatorAttestationCity: stamp.creatorAttestationCity,
    creatorAttestationCountry: stamp.creatorAttestationCountry,
    creatorAttestationAt: stamp.creatorAttestationAt?.toISOString?.() || stamp.creatorAttestationAt,
    statementVersion: stamp.creatorAttestationStatement,
    statement: CREATOR_ATTESTATION_STATEMENT,
    payloadSha256: payloadSha256(payload),
    verifyInstructions:
      'Verify: verifySignature(payload, signature, publicKey) using SHA256 RSA; public key in proof-bundle.json',
    publicKey: passport.publicKey,
  };
}

module.exports = {
  buildAttestationPayload,
  signAttestation,
  verifyAttestation,
  payloadSha256,
  buildAttestationRecord,
};
