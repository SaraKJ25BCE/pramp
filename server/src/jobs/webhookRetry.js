const { processPendingDeliveries } = require('../services/webhooks');

function startWebhookRetryJob() {
  const intervalMs = parseInt(process.env.WEBHOOK_RETRY_INTERVAL_MS || '60000', 10);
  setInterval(() => {
    processPendingDeliveries().catch((err) => {
      console.warn('[WebhookRetry]', err.message);
    });
  }, intervalMs);
  processPendingDeliveries().catch(() => {});
  console.log(`Webhook retry job started (every ${intervalMs}ms)`);
}

module.exports = { startWebhookRetryJob };
