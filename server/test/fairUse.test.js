/**
 * Run: node test/fairUse.test.js (from server/)
 */
const assert = require('assert');
const { resolveFairUseMonthly, isQuotaFullyDisabled, DEFAULT_FAIR_USE_MONTHLY } = require('../src/config/fairUse');

function run() {
  delete process.env.STAMP_FAIR_USE_MONTHLY;
  assert.strictEqual(resolveFairUseMonthly(), DEFAULT_FAIR_USE_MONTHLY);

  process.env.STAMP_FAIR_USE_MONTHLY = '500';
  assert.strictEqual(resolveFairUseMonthly(), 500);

  process.env.STAMP_FAIR_USE_MONTHLY = '0';
  assert.strictEqual(resolveFairUseMonthly(), DEFAULT_FAIR_USE_MONTHLY);

  process.env.STAMP_QUOTA_DISABLED = 'true';
  assert.strictEqual(isQuotaFullyDisabled(), true);

  console.log('fairUse.test.js: all passed');
}

run();
