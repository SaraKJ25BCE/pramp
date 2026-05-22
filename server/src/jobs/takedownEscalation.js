const cron = require('node-cron');
const prisma = require('../config/prisma');
const { sendDMCAEmail, getPlatformConfig } = require('../services/takedownAutomation');

/**
 * Check for takedowns past their response deadline and escalate.
 */
async function checkEscalations() {
  try {
    const now = new Date();

    // Find takedowns that are 'sent' and past their response deadline
    const overdue = await prisma.takedown.findMany({
      where: {
        status: 'sent',
        responseDeadline: { lte: now },
        escalatedAt: null,
      },
      include: {
        stamp: { select: { id: true, title: true } },
        passport: { select: { displayName: true, username: true } },
      },
    });

    if (overdue.length === 0) return { escalated: 0 };

    console.log(`[TakedownEscalation] Found ${overdue.length} overdue takedowns`);

    let escalated = 0;

    for (const takedown of overdue) {
      try {
        // Mark as escalated
        await prisma.takedown.update({
          where: { id: takedown.id },
          data: {
            escalatedAt: now,
            notes: [
              takedown.notes || '',
              `\n[AUTO-ESCALATION ${now.toISOString()}] No response received within SLA deadline. `,
              `Consider filing with the hosting provider or ISP directly, `,
              `or escalating to WIPO Arbitration and Mediation Center.`,
            ].join(''),
          },
        });

        escalated++;
      } catch (err) {
        console.error(`[TakedownEscalation] Failed to escalate ${takedown.id}:`, err.message);
      }
    }

    console.log(`[TakedownEscalation] Escalated ${escalated} takedowns`);
    return { escalated };
  } catch (err) {
    console.error('[TakedownEscalation] Job failed:', err);
    return { escalated: 0, error: err.message };
  }
}

/**
 * Send follow-up notices for takedowns approaching their deadline.
 */
async function sendFollowUpReminders() {
  try {
    const now = new Date();
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

    // Find takedowns that are 'sent' and approaching deadline (within 2 days)
    const approaching = await prisma.takedown.findMany({
      where: {
        status: 'sent',
        responseDeadline: {
          gte: now,
          lte: twoDaysFromNow,
        },
        escalatedAt: null,
      },
      include: {
        stamp: { select: { id: true, title: true } },
        passport: { select: { displayName: true, username: true } },
      },
    });

    // Log approaching deadlines (actual notification would go through a notification system)
    if (approaching.length > 0) {
      console.log(`[TakedownEscalation] ${approaching.length} takedowns approaching deadline`);
    }

    return { approaching: approaching.length };
  } catch (err) {
    console.error('[TakedownEscalation] Reminder check failed:', err);
    return { approaching: 0 };
  }
}

/**
 * Start the escalation monitoring cron job.
 * Runs daily at 9:00 AM to check for overdue takedowns.
 */
function startTakedownEscalationJob() {
  cron.schedule('0 9 * * *', async () => {
    console.log('[TakedownEscalation] Running daily escalation check...');
    await checkEscalations();
    await sendFollowUpReminders();
  });
  console.log('[TakedownEscalation] Daily escalation job scheduled (9:00 AM)');
}

module.exports = {
  checkEscalations,
  sendFollowUpReminders,
  startTakedownEscalationJob,
};
