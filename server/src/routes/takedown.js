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

function generateDmcaLetter(stamp, passport, infringingUrl, platform) {
  const baseUrl = getServerUrl();
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const tsaLine = stamp.tsaTimestamp
    ? `- RFC 3161 Trusted Timestamp: ${new Date(stamp.tsaTimestamp).toISOString()} (${stamp.tsaUrl || 'TSA'}) [verify: ${baseUrl}/tsa/verify/${stamp.id}]`
    : '';
  const s63Line = stamp.evidenceCertificateUrl
    ? `- ${BSA_FRAME.shortLabel}: ${stamp.evidenceCertificateUrl}`
    : `- ${BSA_FRAME.shortLabel}: ${baseUrl}/legal/${stamp.id}/system-certificate`;

  return `DMCA TAKEDOWN NOTICE
Date: ${date}

To: ${platform} Copyright/Legal Team
Re: Copyright Infringement — Immediate Takedown Request

I, ${passport.displayName} (@${passport.username}), am the exclusive rights holder of the copyrighted work described below. I am writing to notify you of an infringement of my copyright.

ORIGINAL WORK:
- Title: ${stamp.title}
- Stamp ID: ${stamp.id}
- Registration Date: ${new Date(stamp.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
- SHA-256 Fingerprint: ${stamp.originalHash}
- License: ${stamp.license}
- Verification: ${process.env.CLIENT_URL}/verify?id=${stamp.id}

INFRINGING MATERIAL:
- URL: ${infringingUrl}
- Platform: ${platform}

CRYPTOGRAPHIC PROOF OF OWNERSHIP:
This work was registered with ProofStamp on ${new Date(stamp.createdAt).toISOString()} with:
- RSA-2048 digital signature tied to my verified identity
- SHA-256 hash: ${stamp.originalHash}
- Perceptual fingerprint (pHash): ${stamp.pHash || 'N/A'}
- DWT-DCT frequency-domain watermark embedded in the image
${tsaLine}
${s63Line}
${stamp.c2paManifestUrl ? '- C2PA Content Credentials manifest embedded' : ''}

PROOF ARTIFACTS (attached / available for download):
- Proof bundle (JSON): ${baseUrl}/stamps/${stamp.id}/proof
- Counsel Evidence Packet (ZIP): ${baseUrl}/legal/${stamp.id}/litigation-pack (authenticated; requires creator attestation)
- Public verification: ${clientUrl}/verify?id=${stamp.id}
- TSA token: ${baseUrl}/tsa/token/${stamp.id}
- Artifacts catalog: ${baseUrl}/legal/${stamp.id}/artifacts

This evidence constitutes cryptographic proof that I possessed this work at the stated time. Present with counsel as appropriate under applicable law.

STATEMENTS:
1. I have a good faith belief that the use of the material in the manner complained of is not authorized by the copyright owner, its agent, or the law.
2. The information in this notification is accurate, and under penalty of perjury, I am the owner of an exclusive right that is being infringed.
3. I acknowledge that under Section 512(f) of the DMCA, any person who knowingly materially misrepresents infringement may be subject to liability.

REQUESTED ACTION:
Please remove or disable access to the infringing material immediately.

Contact Information:
Name: ${passport.displayName}
ProofStamp ID: ${passport.id}
Username: @${passport.username}
Verification Page: ${process.env.CLIENT_URL}/u/${passport.username}

Digital Signature: ${stamp.signature.substring(0, 64)}...

This notice is sent pursuant to the Digital Millennium Copyright Act (17 U.S.C. § 512).`;
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
    const { stampId, infringingUrl, platform, alertId, autoSubmit } = req.body;

    if (!stampId || !infringingUrl || !platform) {
      return res.status(400).json({ error: 'stampId, infringingUrl, and platform are required' });
    }

    const passport = await prisma.passport.findUnique({ where: { userId: req.user.userId } });
    if (!passport) return res.status(404).json({ error: 'Passport not found' });

    const stamp = await prisma.stamp.findUnique({ where: { id: stampId } });
    if (!stamp) return res.status(404).json({ error: 'Stamp not found' });
    if (stamp.passportId !== passport.id) return res.status(403).json({ error: 'Not your stamp' });

    const platformConfig = getPlatformConfig(platform);
    const dmcaLetter = generateDmcaLetter(stamp, passport, infringingUrl, platformConfig.name);

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
