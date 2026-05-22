/**
 * Run: node test/legalProof.test.js (from server/)
 */
require('dotenv').config();
process.env.TSA_MODE = process.env.TSA_MODE || 'development';

const assert = require('assert');
const crypto = require('crypto');
const {
  resolveTsaTier,
  assertTsaAllowedForStamp,
  hasCreatorAttestation,
  needsReattestation,
  CREATOR_ATTESTATION_VERSION,
} = require('../src/config/legalProof');
const { getTimestampToken, verifyTimestampTokenFull } = require('../src/services/timestamping');
const {
  generateSystem63Pdf,
  generateCreatorDeclarationPdf,
} = require('../src/services/legalEvidence');
const {
  buildAttestationPayload,
  signAttestation,
  verifyAttestation,
} = require('../src/services/creatorAttestation');
const {
  verifyAuditChain,
  hashEntry,
  GENESIS,
} = require('../src/services/auditLog');

function generateTestKeypair() {
  const { generateKeyPairSync } = crypto;
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

async function run() {
  assert.strictEqual(resolveTsaTier(), 'development');
  assert.strictEqual(assertTsaAllowedForStamp().ok, true);

  const hash = crypto.createHash('sha256').update('proofstamp-cred-stack').digest('hex');
  let tsaTimestamp = null;
  let tsaUrl = null;
  if (process.env.SKIP_TSA_NETWORK !== '1') {
    try {
      const tsa = await getTimestampToken(hash);
      assert.ok(tsa.tsToken?.length > 0);
      const verify = verifyTimestampTokenFull(tsa.tsToken, hash);
      assert.strictEqual(verify.valid, true);
      tsaTimestamp = tsa.timestamp;
      tsaUrl = tsa.tsaUrl;
    } catch (err) {
      console.warn('legalProof.test.js: TSA network skipped —', err.code || err.message);
    }
  }

  const mockStamp = {
    id: 'PS-2026-TEST1',
    title: 'Test Art',
    originalHash: hash,
    createdAt: new Date(),
    tsaTimestamp,
    tsaUrl,
    tsaVerifyStatus: tsaTimestamp ? 'valid' : null,
    tsaTier: 'development',
    license: 'All Rights Reserved',
    fileName: 'test.png',
    creatorAttestationAt: null,
  };
  const mockPassport = { displayName: 'Test User', username: 'testuser', id: 'pass_test' };
  const systemPdf = await generateSystem63Pdf(mockStamp, mockPassport, { email: 't@example.com' });
  assert.ok(systemPdf.length > 500);
  assert.ok(systemPdf.subarray(0, 5).toString() === '%PDF-');

  const { publicKey, privateKey } = generateTestKeypair();
  const attestedAt = new Date();
  const payload = buildAttestationPayload(
    mockStamp,
    mockPassport.id,
    { fullName: 'Test User', city: 'Mumbai', country: 'India' },
    CREATOR_ATTESTATION_VERSION,
    attestedAt
  );
  const signature = signAttestation(privateKey, payload);
  assert.strictEqual(verifyAttestation(publicKey, payload, signature), true);

  const attestedStamp = {
    ...mockStamp,
    creatorAttestationAt: attestedAt,
    creatorAttestationName: 'Test User',
    creatorAttestationStatement: CREATOR_ATTESTATION_VERSION,
    creatorAttestationPayload: payload,
    creatorAttestationSignature: signature,
  };

  assert.strictEqual(hasCreatorAttestation(attestedStamp), true);
  assert.strictEqual(hasCreatorAttestation({ creatorAttestationAt: attestedAt, creatorAttestationName: 'X' }), false);
  assert.strictEqual(needsReattestation({ creatorAttestationAt: attestedAt, creatorAttestationName: 'X' }), true);

  const creatorPdf = await generateCreatorDeclarationPdf(
    { ...attestedStamp, passport: mockPassport },
    mockPassport,
    { email: 't@example.com' }
  );
  assert.ok(creatorPdf.length > 500);

  const e1 = {
    id: 'a1',
    stampId: 'PS-1',
    action: 'STAMP_CREATED',
    userId: null,
    passportId: 'p1',
    ipAddress: null,
    userAgent: null,
    metadataJson: null,
    previousLogHash: GENESIS,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  e1.entryHash = hashEntry(e1);
  const e2 = {
    id: 'a2',
    stampId: 'PS-1',
    action: 'CREATOR_ATTESTED',
    userId: 'u1',
    passportId: 'p1',
    ipAddress: '127.0.0.1',
    userAgent: 'test',
    metadataJson: '{}',
    previousLogHash: e1.entryHash,
    createdAt: new Date('2026-01-01T00:01:00.000Z'),
  };
  e2.entryHash = hashEntry(e2);
  const chainOk = verifyAuditChain([e1, e2]);
  assert.strictEqual(chainOk.valid, true);

  const tampered = { ...e2, action: 'TAMPERED' };
  const chainBad = verifyAuditChain([e1, tampered]);
  assert.strictEqual(chainBad.valid, false);

  console.log('legalProof.test.js: all passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
