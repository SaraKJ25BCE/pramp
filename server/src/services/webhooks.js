const axios = require('axios');
const prisma = require('../config/prisma');

/**
 * Deliver a webhook payload to the creator's Passport.webhookUrl (if set).
 * Fire-and-forget; logs failures only (never throws to callers).
 */
async function notifyWebhook(passportId, event, payload = {}) {
  try {
    const passport = await prisma.passport.findUnique({
      where: { id: passportId },
      select: { webhookUrl: true, id: true },
    });

    const url = passport?.webhookUrl?.trim();
    if (!url) return;

    await axios.post(
      url,
      {
        source: 'proofstamp',
        event,
        passportId,
        timestamp: new Date().toISOString(),
        payload,
      },
      {
        timeout: 12000,
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'ProofStamp-Webhooks/1.0' },
        validateStatus: (s) => s >= 200 && s < 500,
      }
    );
  } catch (err) {
    console.warn('[Webhook] delivery failed:', err.message);
  }
}

module.exports = { notifyWebhook };
