const express = require('express');
const authMiddleware = require('../middleware/auth');
const prisma = require('../config/prisma');

const router = express.Router();

function generateDmcaLetter(stamp, passport, infringingUrl, platform) {
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
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

This evidence constitutes cryptographic proof that I possessed this work at the stated time and is computationally infeasible to forge.

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

const PLATFORM_INFO = {
  instagram: { name: 'Instagram', reportUrl: 'https://help.instagram.com/contact/552695131608132', method: 'Form submission' },
  twitter: { name: 'Twitter/X', reportUrl: 'https://help.twitter.com/forms/dmca', method: 'Form submission' },
  youtube: { name: 'YouTube', reportUrl: 'https://www.youtube.com/copyright_complaint_page', method: 'Form submission' },
  pinterest: { name: 'Pinterest', reportUrl: 'https://www.pinterest.com/about/copyright/dmca-pin/', method: 'Form submission' },
  facebook: { name: 'Facebook', reportUrl: 'https://www.facebook.com/help/contact/208282075858952', method: 'Form submission' },
  tiktok: { name: 'TikTok', reportUrl: 'https://www.tiktok.com/legal/report/Copyright', method: 'Form submission' },
  behance: { name: 'Behance', reportUrl: 'https://www.behance.net/misc/dmca', method: 'Email' },
  deviantart: { name: 'DeviantArt', reportUrl: 'https://www.deviantart.com/about/policy/copyright/', method: 'Form submission' },
  other: { name: 'Other', reportUrl: null, method: 'Email to site owner' },
};

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
      resolved: takedowns.filter(t => t.status === 'resolved').length,
      rejected: takedowns.filter(t => t.status === 'rejected').length,
    };

    res.json({ takedowns, stats });
  } catch (error) {
    console.error('Error fetching takedowns:', error);
    res.status(500).json({ error: 'Failed to fetch takedowns' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { stampId, infringingUrl, platform, alertId } = req.body;

    if (!stampId || !infringingUrl || !platform) {
      return res.status(400).json({ error: 'stampId, infringingUrl, and platform are required' });
    }

    const passport = await prisma.passport.findUnique({ where: { userId: req.user.userId } });
    if (!passport) return res.status(404).json({ error: 'Passport not found' });

    const stamp = await prisma.stamp.findUnique({ where: { id: stampId } });
    if (!stamp) return res.status(404).json({ error: 'Stamp not found' });
    if (stamp.passportId !== passport.id) return res.status(403).json({ error: 'Not your stamp' });

    const dmcaLetter = generateDmcaLetter(stamp, passport, infringingUrl, PLATFORM_INFO[platform]?.name || platform);

    const takedown = await prisma.takedown.create({
      data: {
        passportId: passport.id,
        stampId,
        alertId: alertId || null,
        platform,
        infringingUrl,
        status: 'draft',
        dmcaLetter,
      },
    });

    if (alertId) {
      await prisma.monitorAlert.update({
        where: { id: alertId },
        data: { status: 'actioned' },
      });
    }

    res.status(201).json({
      takedown,
      platformInfo: PLATFORM_INFO[platform] || PLATFORM_INFO.other,
    });
  } catch (error) {
    console.error('Error creating takedown:', error);
    res.status(500).json({ error: 'Failed to create takedown' });
  }
});

router.patch('/:takedownId/status', authMiddleware, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const validStatuses = ['draft', 'sent', 'acknowledged', 'resolved', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    const passport = await prisma.passport.findUnique({ where: { userId: req.user.userId } });
    const takedown = await prisma.takedown.findUnique({ where: { id: req.params.takedownId } });
    if (!takedown) return res.status(404).json({ error: 'Takedown not found' });
    if (takedown.passportId !== passport.id) return res.status(403).json({ error: 'Not authorized' });

    const updateData = { status };
    if (status === 'sent') updateData.filedAt = new Date();
    if (status === 'resolved' || status === 'rejected') updateData.resolvedAt = new Date();
    if (notes) updateData.notes = notes;

    const updated = await prisma.takedown.update({
      where: { id: req.params.takedownId },
      data: updateData,
    });

    res.json({ takedown: updated });
  } catch (error) {
    console.error('Error updating takedown:', error);
    res.status(500).json({ error: 'Failed to update takedown' });
  }
});

router.get('/platforms', (req, res) => {
  res.json({ platforms: PLATFORM_INFO });
});

module.exports = router;
