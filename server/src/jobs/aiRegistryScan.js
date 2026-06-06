/**
 * AI Registry Scan Job
 * 
 * Background job that runs periodically to scan AI platforms for unauthorized usage.
 * Scans:
 * - Hugging Face datasets and models
 * - Replicate model registry
 * - CivitAI community models
 * - Stability AI (limited)
 * - Kaggle datasets
 * - GitHub repositories mentioning protected works
 * 
 * Runs every 6 hours for active monitoring stamps.
 */

const cron = require('node-cron');
const { prisma } = require('../config/prisma');
const AIRegistryMonitor = require('../services/aiRegistryMonitor');
const { auditLog } = require('../services/auditLog');

let registryScanJob;

/**
 * Start AI Registry Scan Job
 */
function startAIRegistryScanJob() {
  if (registryScanJob) {
    registryScanJob.stop();
  }

  console.log('[AI Registry Scan Job] Starting at:', new Date().toISOString());

  // Run every 6 hours (0, 6, 12, 18)
  registryScanJob = cron.schedule('0 */6 * * *', async () => {
    try {
      console.log('[AI Registry Scan Job] Executing at:', new Date().toISOString());

      // Find all active AI registry monitors that need scanning
      const monitorsToScan = await prisma.aIRegistryMonitor.findMany({
        where: {
          isActive: true,
          OR: [
            { nextScanAt: { lte: new Date() } },
            { lastScanAt: null }
          ]
        },
        include: {
          stamp: {
            select: {
              id: true,
              passportId: true,
              title: true,
              pHash: true,
              originalHash: true
            }
          }
        },
        take: 50 // Batch process 50 at a time
      });

      console.log(`[AI Registry Scan Job] Found ${monitorsToScan.length} monitors to scan`);

      let totalDetections = 0;

      for (const monitor of monitorsToScan) {
        try {
          const result = await AIRegistryMonitor.scanRegistries(
            monitor.stampId,
            monitor.stamp.passportId
          );

          if (result.detections && result.detections.length > 0) {
            totalDetections += result.detections.length;
            console.log(
              `[AI Registry Scan Job] Found ${result.detections.length} detections for stamp ${monitor.stampId}`
            );

            // Send notification to creator
            await sendDetectionNotification(monitor.stamp, result.detections);
          }
        } catch (error) {
          console.error(
            `[AI Registry Scan Job] Error scanning monitor ${monitor.id}:`,
            error
          );

          await auditLog({
            action: 'ai_registry_scan_error',
            stampId: monitor.stampId,
            metadata: {
              error: error.message,
              monitorId: monitor.id
            }
          });
        }
      }

      console.log(
        `[AI Registry Scan Job] Completed. Total detections: ${totalDetections}`
      );

      await auditLog({
        action: 'ai_registry_scan_job_completed',
        metadata: {
          monitorsScanned: monitorsToScan.length,
          totalDetections: totalDetections,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('[AI Registry Scan Job] Fatal error:', error);

      await auditLog({
        action: 'ai_registry_scan_job_failed',
        metadata: {
          error: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  });

  registryScanJob.start();
  console.log('[AI Registry Scan Job] Started.');
}

/**
 * Send notification to creator about detection
 */
async function sendDetectionNotification(stamp, detections) {
  try {
    const { sendMonitorAlertEmail } = require('../services/notifications');

    const user = await prisma.user.findFirst({
      where: {
        passport: {
          stamps: {
            some: { id: stamp.id }
          }
        }
      },
      select: { email: true }
    });

    if (!user) {
      return;
    }

    // Group detections by platform
    const byPlatform = {};
    for (const detection of detections) {
      if (!byPlatform[detection.platform]) {
        byPlatform[detection.platform] = [];
      }
      byPlatform[detection.platform].push(detection);
    }

    const platformSummary = Object.entries(byPlatform)
      .map(([platform, items]) => `${items.length} on ${platform}`)
      .join(', ');

    const emailBody = `
Unauthorized AI Training Detected

Your work "${stamp.title}" (${stamp.id}) has been detected in AI model training on the following platforms:

${Object.entries(byPlatform)
  .map(
    ([platform, items]) => `
${platform.toUpperCase()}:
${items
  .map(
    d => `  - ${d.modelName} (confidence: ${(d.confidence * 100).toFixed(0)}%)
    URL: ${d.modelUrl}`
  )
  .join('\n')}
`
  )
  .join('\n')}

ACTION REQUIRED:
1. Review detections: https://proofstamp.app/stamp/${stamp.id}#ai-training
2. Report to platforms
3. Consider legal action

ProofStamp has already detected this automatically. You can report this to the platforms through our dashboard.
`;

    await sendMonitorAlertEmail(user.email, stamp.title, emailBody, 'AI Training Detection');
  } catch (error) {
    console.error('[AI Registry Scan Job] Error sending notification:', error);
  }
}

/**
 * Stop the AI Registry Scan Job
 */
function stopAIRegistryScanJob() {
  if (registryScanJob) {
    registryScanJob.stop();
    console.log('[AI Registry Scan Job] Stopped');
  }
}

module.exports = {
  startAIRegistryScanJob,
  stopAIRegistryScanJob
};
