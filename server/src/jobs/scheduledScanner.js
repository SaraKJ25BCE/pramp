const cron = require('node-cron');
const axios = require('axios');
const prisma = require('../config/prisma');
const { performExternalScan } = require('../services/reverseSearch');
const { sendMonitorAlertEmail } = require('../services/notifications');

const SCAN_BATCH_SIZE = 20;
const SCAN_DELAY_MS = 3000; // delay between scans to respect rate limits

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate the next scan time based on frequency.
 */
function getNextScanAt(frequency) {
  const now = new Date();
  switch (frequency) {
    case 'daily':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case 'weekly':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case 'monthly':
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
}

/**
 * Run external scans for monitors that are due.
 */
async function runScheduledScans() {
  try {
    const now = new Date();

    // Find monitors due for scanning
    const dueMonitors = await prisma.monitor.findMany({
      where: {
        status: 'active',
        OR: [
          { nextScanAt: null },
          { nextScanAt: { lte: now } },
        ],
      },
      include: {
        stamp: {
          select: {
            id: true,
            originalFileUrl: true,
            pHash: true,
            embedding: true,
            title: true,
            passportId: true,
          },
        },
        passport: {
          include: {
            user: { select: { id: true, email: true } },
          },
        },
      },
      take: SCAN_BATCH_SIZE,
      orderBy: { nextScanAt: 'asc' },
    });

    if (dueMonitors.length === 0) {
      return { scanned: 0, alertsCreated: 0 };
    }

    console.log(`[ScheduledScanner] Processing ${dueMonitors.length} monitors`);

    let totalAlerts = 0;

    for (const monitor of dueMonitors) {
      try {
        const results = await performExternalScan(monitor.stamp);

        let newAlerts = 0;
        for (const result of results) {
          // Check for duplicate by externalId
          const existing = await prisma.monitorAlert.findFirst({
            where: {
              monitorId: monitor.id,
              externalId: result.externalId,
            },
          });

          if (!existing) {
            const alert = await prisma.monitorAlert.create({
              data: {
                monitorId: monitor.id,
                stampId: monitor.stamp.id,
                sourceUrl: result.url,
                sourceName: result.domain || result.pageTitle || 'Unknown',
                matchType: result.matchLevel === 'full' ? 'exact_match' : 'partial_match',
                confidence: result.score || 0.7,
                sourceEngine: result.engine,
                externalId: result.externalId,
              },
            });
            newAlerts++;

            try {
              await sendMonitorAlertEmail({
                userId: monitor.passport?.user?.id || monitor.passport?.userId,
                userEmail: monitor.passport?.user?.email,
                displayName: monitor.passport?.displayName,
                stamp: monitor.stamp,
                alert,
              });
            } catch (mailErr) {
              console.warn('[ScheduledScanner] Alert email failed:', mailErr.message);
            }
          }
        }

        // Update monitor
        await prisma.monitor.update({
          where: { id: monitor.id },
          data: {
            lastScanAt: now,
            nextScanAt: getNextScanAt(monitor.scanFrequency),
            matchCount: { increment: newAlerts },
          },
        });

        totalAlerts += newAlerts;

        // Rate limit between scans
        await sleep(SCAN_DELAY_MS);
      } catch (scanErr) {
        console.error(`[ScheduledScanner] Failed scan for monitor ${monitor.id}:`, scanErr.message);
      }
    }

    console.log(`[ScheduledScanner] Done. Scanned: ${dueMonitors.length}, New alerts: ${totalAlerts}`);
    return { scanned: dueMonitors.length, alertsCreated: totalAlerts };
  } catch (err) {
    console.error('[ScheduledScanner] Job failed:', err);
    return { scanned: 0, alertsCreated: 0, error: err.message };
  }
}

/**
 * Start the scheduled scanning cron job.
 * Runs every 4 hours to process due monitors.
 */
function startScheduledScanner() {
  cron.schedule('0 */4 * * *', async () => {
    console.log('[ScheduledScanner] Running scheduled scan batch...');
    await runScheduledScans();
  });
  console.log('[ScheduledScanner] Cron job scheduled (every 4 hours)');
}

module.exports = {
  runScheduledScans,
  startScheduledScanner,
  getNextScanAt,
};
