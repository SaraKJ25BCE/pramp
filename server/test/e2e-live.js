const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const prisma = new PrismaClient();
const API_BASE = 'http://localhost:3001';
const AUTH_BASE = 'http://localhost:3001/auth';
const STAMP_BASE = 'http://localhost:3001/stamps';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('=== ProofStamp E2E Integration Test ===');
  let jwtToken = '';
  let stampId = '';
  const testEmail = `test_${Date.now()}@example.com`;

  try {
    // 0. CLEANUP PREVIOUS TESTS
    console.log(`\n[0] Cleaning up database...`);
    await prisma.stamp.deleteMany();
    await prisma.passport.deleteMany({
      where: { user: { email: { startsWith: 'test_' } } }
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'test_' } }
    });
    
    // 1. AUTHENTICATION (Bypass Email via Prisma for E2E)
    console.log(`\n[1] Provisioning Test User in DB: ${testEmail}...`);
    const { createUserWithPassport } = require('/app/server/src/services/userProvisioning');
    const { issueAuthToken } = require('/app/server/src/utils/authTokens');
    
    const user = await createUserWithPassport({
      email: testEmail,
      displayName: 'E2E Tester'
    });
    
    // Set username explicitly so passport setup is complete
    const username = `e2e_${Date.now()}`;
    await prisma.passport.update({
      where: { userId: user.id },
      data: { username }
    });
    user.passport.username = username;
    
    jwtToken = issueAuthToken(user);
    console.log(`✅ User provisioned and JWT issued.`);



    // 5. CREATE STAMP (Upload & Stamp combined)
    console.log(`\n[5] Uploading and Creating Stamp...`);
    const formData = new FormData();
    const testFilePath = path.join(__dirname, 'test-image.png');
    
    if (!fs.existsSync(testFilePath)) {
      const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
      fs.writeFileSync(testFilePath, pngBuffer);
    }
    
    formData.append('file', fs.createReadStream(testFilePath));
    formData.append('title', 'E2E Test Artifact');
    formData.append('description', 'Testing end-to-end workflow');
    formData.append('license', 'all-rights-reserved');
    
    const stampRes = await axios.post(`${STAMP_BASE}`, formData, {
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        ...formData.getHeaders()
      }
    });
    
    stampId = stampRes.data.stamp.id;
    console.log(`✅ Stamp created successfully! ID: ${stampId}`);

    // 7. WAIT FOR BACKGROUND TASKS
    console.log(`\n[7] Waiting 5 seconds for background tasks...`);
    await delay(5000);

    // 8. VERIFY STAMP
    console.log(`\n[8] Verifying Stamp...`);
    const verifyStampRes = await axios.get(`${API_BASE}/verify/${stampId}`);
    console.log(`✅ Stamp verified. Contains signature: ${!!verifyStampRes.data.protection?.signature}`);

    // 8.5 ATTEST STAMP
    console.log(`\n[8.5] Attesting Stamp (Legal Requirement)...`);
    await axios.post(`${API_BASE}/legal/${stampId}/attest`, {
      fullName: 'E2E Tester',
      confirm: true,
      statementConfirm: true,
      city: 'Testville',
      country: 'Testland'
    }, { headers: { 'Authorization': `Bearer ${jwtToken}` } });
    console.log(`✅ Stamp legally attested.`);

    // 9. LEGAL PROOFS (Evidence Packet)
    console.log(`\n[9] Generating Legal Evidence Packet...`);
    const packetRes = await axios.get(`${API_BASE}/legal/${stampId}/litigation-pack`, {
      headers: { 'Authorization': `Bearer ${jwtToken}` },
      responseType: 'arraybuffer'
    });
    console.log(`✅ Evidence packet generated! Size: ${packetRes.data.length} bytes`);

    // 10. AI PROTECTION: GENERATE TOKEN
    console.log(`\n[10] Generating AI Access Token...`);
    const aiTokenRes = await axios.post(`${API_BASE}/api/ai-protection/access-token`, {
      stampId: stampId,
      licenseType: 'all-rights-reserved',
      restrictions: { allowAI: false }
    }, { headers: { 'Authorization': `Bearer ${jwtToken}` } });
    console.log(`✅ AI Token generated: ${aiTokenRes.data.token}`);

    // 11. AI PROTECTION: ENABLE REGISTRY MONITOR
    console.log(`\n[11] Enabling AI Registry Monitor...`);
    const aiMonitorRes = await axios.post(`${API_BASE}/api/ai-protection/registry-monitor`, {
      stampId: stampId,
      platforms: ['hugging_face', 'replicate'],
      scanFrequency: 'weekly'
    }, { headers: { 'Authorization': `Bearer ${jwtToken}` } });
    console.log(`✅ AI Registry Monitor enabled for platforms: ${aiMonitorRes.data.monitoring.monitoringPlatforms.join(',')}`);

    console.log('\n🎉 ALL E2E TESTS PASSED SUCCESSFULLY! 🎉');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ E2E TEST FAILED!');
    if (error.response) {
      console.error(error.response.status, error.response.data);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

runTests();
