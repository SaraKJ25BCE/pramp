const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const authMiddleware = require('../middleware/auth');
const prisma = require('../config/prisma');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const passport = await prisma.passport.findUnique({ where: { userId: req.user.userId } });
    if (!passport) return res.status(404).json({ error: 'Passport not found' });

    const monitors = await prisma.monitor.findMany({
      where: { passportId: passport.id },
      include: {
        stamp: { select: { id: true, title: true, thumbnailUrl: true, category: true, pHash: true } },
        alerts: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
      orderBy: { createdAt: 'desc' },
    });

    const stats = {
      totalMonitored: monitors.length,
      activeMonitors: monitors.filter(m => m.status === 'active').length,
      totalAlerts: monitors.reduce((sum, m) => sum + m.alerts.length, 0),
      newAlerts: monitors.reduce((sum, m) => sum + m.alerts.filter(a => a.status === 'new').length, 0),
    };

    res.json({ monitors, stats });
  } catch (error) {
    console.error('Error fetching monitors:', error);
    res.status(500).json({ error: 'Failed to fetch monitors' });
  }
});

router.post('/enable/:stampId', authMiddleware, async (req, res) => {
  try {
    const passport = await prisma.passport.findUnique({ where: { userId: req.user.userId } });
    if (!passport) return res.status(404).json({ error: 'Passport not found' });

    const stamp = await prisma.stamp.findUnique({ where: { id: req.params.stampId } });
    if (!stamp) return res.status(404).json({ error: 'Stamp not found' });
    if (stamp.passportId !== passport.id) return res.status(403).json({ error: 'Not your stamp' });
    if (stamp.category !== 'image') return res.status(400).json({ error: 'Monitoring only available for images' });

    const monitor = await prisma.monitor.upsert({
      where: { passportId_stampId: { passportId: passport.id, stampId: stamp.id } },
      update: { status: 'active' },
      create: { passportId: passport.id, stampId: stamp.id, status: 'active' },
    });

    await prisma.stamp.update({ where: { id: stamp.id }, data: { monitorEnabled: true } });

    res.json({ monitor, message: 'Monitoring enabled' });
  } catch (error) {
    console.error('Error enabling monitor:', error);
    res.status(500).json({ error: 'Failed to enable monitoring' });
  }
});

router.post('/disable/:stampId', authMiddleware, async (req, res) => {
  try {
    const passport = await prisma.passport.findUnique({ where: { userId: req.user.userId } });
    if (!passport) return res.status(404).json({ error: 'Passport not found' });

    await prisma.monitor.updateMany({
      where: { passportId: passport.id, stampId: req.params.stampId },
      data: { status: 'paused' },
    });

    await prisma.stamp.update({ where: { id: req.params.stampId }, data: { monitorEnabled: false } });

    res.json({ message: 'Monitoring paused' });
  } catch (error) {
    console.error('Error disabling monitor:', error);
    res.status(500).json({ error: 'Failed to disable monitoring' });
  }
});

router.post('/scan/:stampId', authMiddleware, async (req, res) => {
  try {
    const passport = await prisma.passport.findUnique({ where: { userId: req.user.userId } });
    if (!passport) return res.status(404).json({ error: 'Passport not found' });

    const stamp = await prisma.stamp.findUnique({ where: { id: req.params.stampId } });
    if (!stamp) return res.status(404).json({ error: 'Stamp not found' });
    if (stamp.passportId !== passport.id) return res.status(403).json({ error: 'Not your stamp' });

    const monitor = await prisma.monitor.findUnique({
      where: { passportId_stampId: { passportId: passport.id, stampId: stamp.id } },
    });
    if (!monitor) return res.status(400).json({ error: 'Monitoring not enabled for this stamp' });

    // Perform scan: compare pHash against all OTHER stamps in the system
    const allOtherStamps = await prisma.stamp.findMany({
      where: {
        pHash: { not: null },
        passportId: { not: passport.id },
      },
      select: { id: true, pHash: true, dHash: true, title: true, thumbnailUrl: true, originalFileUrl: true,
                passport: { select: { username: true, displayName: true } } },
    });

    const matches = [];
    for (const other of allOtherStamps) {
      const dist = hammingDistance(stamp.pHash, other.pHash);
      if (dist < 25) {
        matches.push({
          stampId: other.id,
          title: other.title,
          owner: other.passport.username,
          distance: dist,
          confidence: dist <= 5 ? 0.95 : dist <= 10 ? 0.85 : dist <= 18 ? 0.7 : 0.5,
          url: other.originalFileUrl,
          thumbnailUrl: other.thumbnailUrl,
        });
      }
    }

    // Create alerts for new matches
    const newAlerts = [];
    for (const match of matches) {
      const existing = await prisma.monitorAlert.findFirst({
        where: { monitorId: monitor.id, sourceUrl: match.url },
      });
      if (!existing) {
        const alert = await prisma.monitorAlert.create({
          data: {
            monitorId: monitor.id,
            stampId: stamp.id,
            sourceUrl: match.url,
            sourceName: `@${match.owner} - ${match.title}`,
            matchType: 'perceptual_hash',
            confidence: match.confidence,
            screenshotUrl: match.thumbnailUrl,
          },
        });
        newAlerts.push(alert);
      }
    }

    await prisma.monitor.update({
      where: { id: monitor.id },
      data: { lastScanAt: new Date(), matchCount: { increment: newAlerts.length } },
    });

    res.json({
      scanned: allOtherStamps.length,
      matchesFound: matches.length,
      newAlerts: newAlerts.length,
      matches,
    });
  } catch (error) {
    console.error('Error scanning:', error);
    res.status(500).json({ error: 'Scan failed' });
  }
});

router.get('/alerts', authMiddleware, async (req, res) => {
  try {
    const passport = await prisma.passport.findUnique({ where: { userId: req.user.userId } });
    if (!passport) return res.status(404).json({ error: 'Passport not found' });

    const alerts = await prisma.monitorAlert.findMany({
      where: { monitor: { passportId: passport.id } },
      include: {
        stamp: { select: { id: true, title: true, thumbnailUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ alerts });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

router.patch('/alerts/:alertId', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['new', 'reviewed', 'dismissed', 'actioned'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const alert = await prisma.monitorAlert.update({
      where: { id: req.params.alertId },
      data: { status },
    });

    res.json({ alert });
  } catch (error) {
    console.error('Error updating alert:', error);
    res.status(500).json({ error: 'Failed to update alert' });
  }
});

function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return Infinity;
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const b1 = parseInt(hash1[i], 16);
    const b2 = parseInt(hash2[i], 16);
    let xor = b1 ^ b2;
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

module.exports = router;
