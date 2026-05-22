const cron = require('node-cron');
const prisma = require('../config/prisma');

async function upgradePendingOts() {
  const pending = await prisma.blockchainAnchor.findMany({
    where: { blockchainStatus: 'pending', otsPendingBytes: { not: null } },
    take: 20,
  });

  let OpenTimestamps;
  try {
    OpenTimestamps = require('opentimestamps');
  } catch (err) {
    console.warn('[OTS Upgrade] opentimestamps not available:', err.message);
    return;
  }

  for (const anchor of pending) {
    try {
      const detached = OpenTimestamps.DetachedTimestampFile.deserialize(
        Buffer.from(anchor.otsPendingBytes)
      );
      const upgraded = await OpenTimestamps.upgrade(detached);
      if (!upgraded) continue;

      const confirmedBytes = detached.serializeToBytes();
      await prisma.blockchainAnchor.update({
        where: { id: anchor.id },
        data: {
          blockchainStatus: 'confirmed',
          chain: 'opentimestamps',
          otsConfirmedBytes: Buffer.from(confirmedBytes),
        },
      });
      console.log(`[OTS Upgrade] Confirmed anchor ${anchor.id}`);
    } catch (err) {
      console.warn(`[OTS Upgrade] ${anchor.id}:`, err.message);
    }
  }
}

function startOtsUpgradeJob() {
  if (process.env.BLOCKCHAIN_ANCHOR_DISABLED === 'true') return;
  cron.schedule('0 */2 * * *', () => {
    upgradePendingOts().catch((e) => console.error('[OTS Upgrade]', e));
  });
  upgradePendingOts().catch((e) => console.error('[OTS Upgrade] initial:', e));
  console.log('[OTS Upgrade] Pending OTS upgrade job scheduled (every 2h)');
}

module.exports = { upgradePendingOts, startOtsUpgradeJob };
