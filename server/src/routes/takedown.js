const express = require('express');
const authMiddleware = require('../middleware/auth');
const prisma = require('../config/prisma');
const { notifyWebhook } = require('../services/webhooks');
const {
  autoSubmitTakedown,
  calculateResponseDeadline,
  getAllPlatforms,
  getPlatformConfig,
} = require('../services/takedownAutomation');
const { startTakedownEscalationJob } = require('../jobs/takedownEscalation');
const { BSA_FRAME } = require('../content/legalCopy');

const router = express.Router();

function getServerUrl() {
  return process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3001}`;
}

function generateLegalNotice(stamp, passport, infringingUrl, platform, type = 'copyright') {
  const baseUrl = getServerUrl();
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const tsaLine = stamp.tsaTimestamp
    ? `- RFC 3161 Trusted Timestamp: ${new Date(stamp.tsaTimestamp).toISOString()} (${stamp.tsaUrl || 'TSA'}) [verify: ${baseUrl}/tsa/verify/${stamp.id}]`
    : '';
  const s63Line = stamp.evidenceCertificateUrl
    ? `- ${BSA_FRAME.shortLabel}: ${stamp.evidenceCertificateUrl}`
    : `- ${BSA_FRAME.shortLabel}: ${baseUrl}/legal/${stamp.id}/system-certificate`;

  if (type === 'deepfake') {
    return `URGENT: STATUTORY GRIEVANCE NOTICE — IMPERSONATION / DEEPFAKE
Date: ${date}

To: The Resident Grievance Officer, ${platform}
Re: Immediate 24-Hour Takedown Request under Rule 3(2)(b) of the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021

I, ${passport.displayName} (@${passport.username}), am the individual depicted in the original image/content described below. I am writing to notify you that the content hosted at the URL below is a digitally manipulated, non-consensual deepfake or impersonation of my likeness.

ORIGINAL VERIFIED IDENTITY RECORD:
- Stamp ID: ${stamp.id}
- Registration Date: ${new Date(stamp.createdAt).toISOString()}
- SHA-256 Fingerprint: ${stamp.originalHash}
- Verification: ${clientUrl}/verify?id=${stamp.id}

INFRINGING MANIPULATED MATERIAL:
- URL: ${infringingUrl}
- Platform: ${platform}

CRYPTOGRAPHIC PROOF OF TAMPERING:
This original image was registered with ProofStamp. The uploaded material on your platform fails structural similarity tests and C2PA provenance checks, definitively proving it is a synthetic manipulation (deepfake).
${tsaLine}
${s63Line}

STATUTORY MANDATE (INDIA):
Under Rule 3(2)(b) of the Information Technology (Intermediary Guidelines) Rules, 2021, you are legally mandated to take all reasonable and practicable measures to remove or disable access to this content within 24 hours of receiving this complaint.

REQUESTED ACTION:
Remove the manipulated material at ${infringingUrl} immediately to comply with Indian law.

Contact Information:
Name: ${passport.displayName}
ProofStamp ID: ${passport.id}
Username: @${passport.username}`;
  }

  return `DMCA & IT RULES 2021 TAKEDOWN NOTICE
Date: ${date}

To: ${platform} Copyright/Grievance Officer
Re: Copyright Infringement — Takedown Request (Rule 3(1)(b)(iv) of IT Rules 2021)

I, ${passport.displayName} (@${passport.username}), am the exclusive rights holder of the copyrighted work described below. I am writing to notify you of an infringement of my copyright.

ORIGINAL WORK:
- Title: ${stamp.title}
- Stamp ID: ${stamp.id}
- Registration Date: ${new Date(stamp.createdAt).toISOString()}
- SHA-256 Fingerprint: ${stamp.originalHash}
- License: ${stamp.license}
- Verification: ${clientUrl}/verify?id=${stamp.id}

INFRINGING MATERIAL:
- URL: ${infringingUrl}
- Platform: ${platform}

CRYPTOGRAPHIC PROOF OF OWNERSHIP:
This work was registered with ProofStamp on ${new Date(stamp.createdAt).toISOString()} with:
- RSA-2048 digital signature tied to my verified identity
- SHA-256 hash: ${stamp.originalHash}
- DWT-DCT frequency-domain watermark embedded in the image
${tsaLine}
${s63Line}

REQUESTED ACTION:
Under Rule 3(1)(b) of the IT Rules 2021 and the DMCA, please remove or disable access to the infringing material immediately.

Contact Information:
Name: ${passport.displayName}
ProofStamp ID: ${passport.id}

This notice is sent pursuant to the Information Technology Rules, 2021 and the Digital Millennium Copyright Act (17 U.S.C. § 512).`;
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const passport = await prisma.passport.findUnique({ where: { userId: req.user.userId } });
    if (!passport) return res.status(404).json({ error: 'Passport not found' });

    const takedowns = await prisma.takedown.findMany({
      where: { passportId: passport.id },
      include: {
        stamp: { select: { id: true, title: true, thumbnailUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const stats = {
      total: takedowns.length,
      draft: takedowns.filter(t => t.status === 'draft').length,
      sent: takedowns.filter(t => t.status === 'sent').length,
      acknowledged: takedowns.filter(t => t.status === 'acknowledged').length,
      resolved: takedowns.filter(t => t.status === 'resolved').length,
      rejected: takedowns.filter(t => t.status === 'rejected').length,
      overdue: takedowns.filter(t =>
        t.status === 'sent' && t.responseDeadline && new Date(t.responseDeadline) < new Date()
      ).length,
      autoSubmitted: takedowns.filter(t => t.autoSubmitted).length,
    };

    res.json({ takedowns, stats });
  } catch (error) {
    console.error('Error fetching takedowns:', error);
    res.status(500).json({ error: 'Failed to fetch takedowns' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { stampId, infringingUrl, platform, alertId, autoSubmit, type = 'copyright' } = req.body;

    if (!stampId || !infringingUrl || !platform) {
      return res.status(400).json({ error: 'stampId, infringingUrl, and platform are required' });
    }

    const passport = await prisma.passport.findUnique({ where: { userId: req.user.userId } });
    if (!passport) return res.status(404).json({ error: 'Passport not found' });

    const stamp = await prisma.stamp.findUnique({ where: { id: stampId } });
    if (!stamp) return res.status(404).json({ error: 'Stamp not found' });
    if (stamp.passportId !== passport.id) return res.status(403).json({ error: 'Not your stamp' });

    const platformConfig = getPlatformConfig(platform);
    const dmcaLetter = generateLegalNotice(stamp, passport, infringingUrl, platformConfig.name, type);

    const takedown = await prisma.takedown.create({
      data: {
        passportId: passport.id,
        stampId,
        alertId: alertId || null,
        platform,
        infringingUrl,
        status: 'draft',
        dmcaLetter,
        submissionMethod: platformConfig.method,
      },
    });

    if (alertId) {
      await prisma.monitorAlert.update({
        where: { id: alertId },
        data: { status: 'actioned' },
      });
    }

    // Auto-submit if requested and platform supports it
    let submissionResult = null;
    if (autoSubmit) {
      submissionResult = await autoSubmitTakedown(takedown, stamp);

      if (submissionResult.submitted) {
        const responseDeadline = calculateResponseDeadline(platform);
        await prisma.takedown.update({
          where: { id: takedown.id },
          data: {
            status: 'sent',
            autoSubmitted: true,
            filedAt: new Date(),
            responseDeadline,
            externalTicketId: submissionResult.details?.messageId || null,
          },
        });
      }
    }

    res.status(201).json({
      takedown: await prisma.takedown.findUnique({ where: { id: takedown.id } }),
      platformInfo: platformConfig,
      submissionResult,
    });
  } catch (error) {
    console.error('Error creating takedown:', error);
    res.status(500).json({ error: 'Failed to create takedown' });
  }
});

router.post('/:takedownId/submit', authMiddleware, async (req, res) => {
  try {
    const passport = await prisma.passport.findUnique({ where: { userId: req.user.userId } });
    const takedown = await prisma.takedown.findUnique({
      where: { id: req.params.takedownId },
      include: { stamp: true },
    });

    if (!takedown) return res.status(404).json({ error: 'Takedown not found' });
    if (takedown.passportId !== passport.id) return res.status(403).json({ error: 'Not authorized' });
    if (takedown.status !== 'draft') {
      return res.status(400).json({ error: 'Takedown has already been submitted' });
    }

    const submissionResult = await autoSubmitTakedown(takedown, takedown.stamp);

    if (submissionResult.submitted) {
      const responseDeadline = calculateResponseDeadline(takedown.platform);
      await prisma.takedown.update({
        where: { id: takedown.id },
        data: {
          status: 'sent',
          autoSubmitted: true,
          filedAt: new Date(),
          responseDeadline,
          externalTicketId: submissionResult.details?.messageId || null,
        },
      });
    }

    res.json({
      takedown: await prisma.takedown.findUnique({ where: { id: takedown.id } }),
      submissionResult,
    });
  } catch (error) {
    console.error('Error submitting takedown:', error);
    res.status(500).json({ error: 'Failed to submit takedown' });
  }
});

router.patch('/:takedownId/status', authMiddleware, async (req, res) => {
  try {
    const { status, notes, externalTicketId } = req.body;
    const validStatuses = ['draft', 'sent', 'acknowledged', 'resolved', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    const passport = await prisma.passport.findUnique({ where: { userId: req.user.userId } });
    const takedown = await prisma.takedown.findUnique({ where: { id: req.params.takedownId } });
    if (!takedown) return res.status(404).json({ error: 'Takedown not found' });
    if (takedown.passportId !== passport.id) return res.status(403).json({ error: 'Not authorized' });

    const updateData = { status };

    if (status === 'sent' && !takedown.filedAt) {
      updateData.filedAt = new Date();
      updateData.responseDeadline = calculateResponseDeadline(takedown.platform);
    }
    if (status === 'resolved' || status === 'rejected') {
      updateData.resolvedAt = new Date();
      updateData.resolution = status;
    }
    if (notes) updateData.notes = notes;
    if (externalTicketId) updateData.externalTicketId = externalTicketId;

    const updated = await prisma.takedown.update({
      where: { id: req.params.takedownId },
      data: updateData,
    });

    setImmediate(() => {
      const payload = {
        takedownId: updated.id,
        stampId: updated.stampId,
        platform: updated.platform,
        status: updated.status,
      };
      notifyWebhook(passport.id, 'takedown.status', payload);
      if (status === 'resolved') {
        notifyWebhook(passport.id, 'takedown.resolved', payload);
      }
    });

    res.json({ takedown: updated });
  } catch (error) {
    console.error('Error updating takedown:', error);
    res.status(500).json({ error: 'Failed to update takedown' });
  }
});

router.get('/platforms', (req, res) => {
  res.json({ platforms: getAllPlatforms() });
});

// Start the escalation monitoring job
startTakedownEscalationJob();

module.exports = router;
