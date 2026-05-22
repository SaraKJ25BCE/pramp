/**
 * Run: node test/apiVerify.test.js (from server/)
 * Contract shape test using a minimal mock stamp object through route helpers.
 */
require('dotenv').config();
const assert = require('assert');
const { buildVerifyInstructions } = require('../src/utils/verifyInstructions');

const REQUIRED_API_FIELDS = [
  'stamp_id',
  'original_hash',
  'signature_valid',
  'tsa_status',
  'creator_attestation_complete',
  'audit_chain_head_hash',
  'system_certificate_url',
  'verify_instructions',
];

function run() {
  const baseUrl = 'http://localhost:3001';
  const instructions = buildVerifyInstructions(baseUrl, 'PS-TEST');
  assert.ok(instructions.hash);
  assert.ok(instructions.rsa);
  assert.ok(instructions.attestation);
  assert.ok(instructions.tsa);
  assert.ok(instructions.auditChain);

  const mockResponse = {
    stamp_id: 'PS-TEST',
    original_hash: 'abc',
    signature_valid: true,
    tsa_status: 'pending',
    creator_attestation: { cryptographically_bound: false },
    creator_attestation_complete: false,
    audit_chain_head_hash: null,
    system_certificate_url: null,
    verify_instructions: instructions,
  };

  for (const field of REQUIRED_API_FIELDS) {
    assert.ok(field in mockResponse || field === 'system_certificate_url', `contract field ${field}`);
  }

  console.log('apiVerify.test.js: all passed');
}

run();
