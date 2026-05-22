/**
 * Run: node test/tsaFallback.test.js (from server/)
 * Mocks axios to verify fallback order when primary TSA fails.
 */
require('dotenv').config();
const assert = require('assert');
const crypto = require('crypto');

const hash = crypto.createHash('sha256').update('tsa-fallback-test').digest('hex');

let callCount = 0;
const axios = require('axios');
const originalPost = axios.post.bind(axios);

axios.post = async (url, ...args) => {
  callCount += 1;
  if (url.includes('freetsa.org')) {
    const err = new Error('timeout');
    err.code = 'ETIMEDOUT';
    throw err;
  }
  return originalPost(url, ...args);
};

async function run() {
  const { getTimestampToken } = require('../src/services/timestamping');
  try {
    await getTimestampToken(hash);
    assert.ok(callCount >= 2, 'expected fallback after FreeTSA failure');
    console.log('tsaFallback.test.js: fallback invoked (calls:', callCount, ')');
  } catch (err) {
    if (callCount >= 2) {
      console.log('tsaFallback.test.js: all providers failed but fallback order OK (calls:', callCount, ')');
    } else {
      throw err;
    }
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
