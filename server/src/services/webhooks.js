const crypto = require('crypto');
const axios = require('axios');
const prisma = require('../config/prisma');

const MAX_ENDPOINTS = 3;
const MAX_ATTEMPTS = 6;

function signPayload(secret, body) {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

function buildEnvelope(passportId, event, payload) {
  return {
    source: 'proofstamp',
    event,
    passportId,
    timestamp: new Date().toISOString(),
    payload,
  };
}

async function deliverToUrl(url, secret, envelope) {
  const body = JSON.stringify(envelope);
  const signature = signPayload(secret, body);
  const response = await axios.post(url, envelope, {
    timeout: 12000,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'ProofStamp-Webhooks/2.0',
      'X-ProofStamp-Signature': `sha256=${signature}`,
      'X-ProofStamp-Event': envelope.event,
    },
    validateStatus: (s) => s >= 200 && s < 300,
  });
  return response.status;
}

async function queueDelivery(endpointId, event, envelope) {
  await prisma.webhookDelivery.create({
    data: {
      endpointId,
      event,
      payloadJson: JSON.stringify(envelope),
      status: 'pending',
      nextRetryAt: new Date(),
    },
  });
  setImmediate(() => {
    processPendingDeliveries().catch(() => {});
  });
}

/**
 * Fire webhook to all enabled endpoints (max 3) + legacy Passport.webhookUrl.
 */
async function notifyWebhook(passportId, event, payload = {}) {
  try {
    const envelope = buildEnvelope(passportId, event, payload);

    const [endpoints, passport] = await Promise.all([
      prisma.webhookEndpoint.findMany({
        where: { passportId, enabled: true },
        take: MAX_ENDPOINTS,
      }),
      prisma.passport.findUnique({
        where: { id: passportId },
        select: { webhookUrl: true },
      }),
    ]);

    const jobs = endpoints.map((ep) => queueDelivery(ep.id, event, envelope));

    const legacyUrl = passport?.webhookUrl?.trim();
    if (legacyUrl && /^https:\/\/.+/i.test(legacyUrl)) {
      jobs.push(
        (async () => {
          try {
            await deliverToUrl(legacyUrl, process.env.WEBHOOK_LEGACY_SECRET || 'proofstamp-legacy', envelope);
          } catch (err) {
            console.warn('[Webhook] legacy URL failed:', err.message);
          }
        })()
      );
    }

    await Promise.all(jobs);
  } catch (err) {
    console.warn('[Webhook] notify failed:', err.message);
  }
}

async function processPendingDeliveries() {
  const now = new Date();
  const pending = await prisma.webhookDelivery.findMany({
    where: {
      status: 'pending',
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    },
    include: { endpoint: true },
    take: 50,
    orderBy: { createdAt: 'asc' },
  });

  for (const delivery of pending) {
    const ep = delivery.endpoint;
    if (!ep?.enabled) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'failed', lastError: 'endpoint disabled' },
      });
      continue;
    }

    const envelope = JSON.parse(delivery.payloadJson);
    const attempts = delivery.attempts + 1;

    try {
      await deliverToUrl(ep.url, ep.secret, envelope);
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'success', attempts, lastError: null },
      });
    } catch (err) {
      const lastError = err.message?.slice(0, 500) || 'delivery failed';
      if (attempts >= MAX_ATTEMPTS) {
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: 'failed', attempts, lastError },
        });
      } else {
        const delayMs = Math.min(3600000, 2000 * 2 ** attempts);
        await prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'pending',
            attempts,
            lastError,
            nextRetryAt: new Date(Date.now() + delayMs),
          },
        });
      }
    }
  }
}

module.exports = {
  notifyWebhook,
  processPendingDeliveries,
  signPayload,
  buildEnvelope,
  MAX_ENDPOINTS,
};
