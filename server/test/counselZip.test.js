/**
 * Run: node test/counselZip.test.js (from server/)
 */
require('dotenv').config();
const assert = require('assert');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const {
  buildLitigationPackZip,
  generateSystem63Pdf,
  generateCreatorDeclarationPdf,
} = require('../src/services/legalEvidence');
const { buildAttestationRecord } = require('../src/services/creatorAttestation');
const { buildAttestationPayload, signAttestation } = require('../src/services/creatorAttestation');
const { CREATOR_ATTESTATION_VERSION } = require('../src/config/legalProof');

function generateTestKeypair() {
  const { generateKeyPairSync } = crypto;
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

async function run() {
  const hash = crypto.createHash('sha256').update('zip-test').digest('hex');
  const { publicKey, privateKey } = generateTestKeypair();
  const attestedAt = new Date();
  const passport = { id: 'PP-TEST', displayName: 'T', username: 't', publicKey };
  const payload = buildAttestationPayload(
    { id: 'PS-ZIP1', originalHash: hash },
    passport.id,
    { fullName: 'Test User', city: 'Delhi', country: 'India' },
    CREATOR_ATTESTATION_VERSION,
    attestedAt
  );
  const sig = signAttestation(privateKey, payload);

  const stamp = {
    id: 'PS-ZIP1',
    title: 'Zip Test',
    originalHash: hash,
    createdAt: attestedAt,
    tsaTimestamp: attestedAt,
    tsaUrl: 'https://example.com/tsr',
    tsaVerifyStatus: 'valid',
    tsaTier: 'development',
    tsaProviderName: 'test',
    tsaToken: Buffer.from('fake-tsr'),
    license: 'ARR',
    fileName: 't.png',
    creatorAttestationAt: attestedAt,
    creatorAttestationName: 'Test User',
    creatorAttestationStatement: CREATOR_ATTESTATION_VERSION,
    creatorAttestationPayload: payload,
    creatorAttestationSignature: sig,
    creatorAttestationCity: 'Delhi',
    creatorAttestationCountry: 'India',
  };

  const systemCertBuffer = await generateSystem63Pdf(stamp, passport, { email: 't@t.com' });
  const creatorPdf = await generateCreatorDeclarationPdf(stamp, passport, { email: 't@t.com' });
  const proofBundle = {
    stampId: stamp.id,
    creatorAttestation: { verified: true },
    auditChainHeadHash: 'abc',
  };
  const attestationRecord = buildAttestationRecord(stamp, passport, payload, sig);

  const zipBuf = await buildLitigationPackZip(stamp, passport, { email: 't@t.com' }, proofBundle, {
    systemCertBuffer,
    creatorDeclarationBuffer: creatorPdf,
    attestationRecord,
    auditChainExport: { entries: [], verification: { valid: true, headHash: 'abc' } },
    auditChainVerificationText: 'ok',
  });

  const zip = new AdmZip(zipBuf);
  const names = zip.getEntries().map((e) => e.entryName);
  const required = [
    'bsa-section63-system-certificate.pdf',
    'attestation-record.json',
    'tsa-token.tsr',
    'audit-log.json',
    'proof-bundle.json',
  ];
  for (const f of required) {
    assert.ok(names.includes(f), `missing ${f} in ZIP`);
  }
  const attestJson = JSON.parse(zip.readAsText('attestation-record.json'));
  assert.strictEqual(attestJson.verified, true);

  console.log('counselZip.test.js: all passed');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
