const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const authMiddleware = require('../middleware/auth');
const prisma = require('../config/prisma');
const { notifyWebhook } = require('../services/webhooks');
const { performExternalScan } = require('../services/reverseSearch');
const { sendMonitorAlertEmail } = require('../services/notifications');
const { getMonitoringCapabilities } = require('../services/monitoringCapabilities');

const router = express.Router();

router.get('/capabilities', authMiddleware, (req, res) => {
  res.json(getMonitoringCapabilities());
});

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
    const passport = await prisma.passport.findUnique({
      where: { userId: req.user.userId },
      include: { user: { select: { email: true } } },
    });
    if (!passport) return res.status(404).json({ error: 'Passport not found' });

    const stamp = await prisma.stamp.findUnique({ where: { id: req.params.stampId } });
    if (!stamp) return res.status(404).json({ error: 'Stamp not found' });
    if (stamp.passportId !== passport.id) return res.status(403).json({ error: 'Not your stamp' });

    const monitor = await prisma.monitor.findUnique({
      where: { passportId_stampId: { passportId: passport.id, stampId: stamp.id } },
    });
    if (!monitor) return res.status(400).json({ error: 'Monitoring not enabled for this stamp' });

    // Perform scan: compare pHash + CNN embedding against all OTHER stamps
    const allOtherStamps = await prisma.stamp.findMany({
      where: {
        pHash: { not: null },
        passportId: { not: passport.id },
      },
      select: { id: true, pHash: true, dHash: true, embedding: true, title: true,
                thumbnailUrl: true, originalFileUrl: true,
                passport: { select: { username: true, displayName: true } } },
    });

    const matches = [];
    for (const other of allOtherStamps) {
      const dist = hammingDistance(stamp.pHash, other.pHash);
      let cnnSimilarity = null;

      // CNN embedding comparison (more robust than pHash)
      if (stamp.embedding?.length > 0 && other.embedding?.length > 0) {
        cnnSimilarity = cosineSimilarity(stamp.embedding, other.embedding);
      }

      const isPhashMatch = dist < 25;
      const isCnnMatch = cnnSimilarity !== null && cnnSimilarity > 0.70;

      if (isPhashMatch || isCnnMatch) {
        let confidence;
        let matchType = 'perceptual_hash';

        if (cnnSimilarity !== null && cnnSimilarity > 0.85) {
          confidence = Math.min(0.98, cnnSimilarity);
          matchType = 'cnn_embedding';
        } else if (dist <= 5) {
          confidence = 0.95;
        } else if (cnnSimilarity !== null && cnnSimilarity > 0.70) {
          confidence = cnnSimilarity * 0.9;
          matchType = 'cnn_embedding';
        } else if (dist <= 10) {
          confidence = 0.85;
        } else if (dist <= 18) {
          confidence = 0.7;
        } else {
          confidence = 0.5;
        }

        matches.push({
          stampId: other.id,
          title: other.title,
          owner: other.passport.username,
          distance: dist,
          cnnSimilarity,
          confidence,
          matchType,
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
            matchType: match.matchType,
            confidence: match.confidence,
            screenshotUrl: match.thumbnailUrl,
            sourceEngine: 'internal',
          },
        });
        newAlerts.push(alert);
        try {
          await sendMonitorAlertEmail({
            userId: req.user.userId,
            userEmail: passport.user?.email,
            displayName: passport.displayName,
            stamp,
            alert,
          });
        } catch (mailErr) {
          console.warn('Alert email failed:', mailErr.message);
        }
      }
    }

    // External reverse image search (TinEye + Google Vision)
    let externalResults = [];
    try {
      externalResults = await performExternalScan(stamp);
      for (const result of externalResults) {
        const existing = await prisma.monitorAlert.findFirst({
          where: { monitorId: monitor.id, externalId: result.externalId },
        });
        if (!existing) {
          const alert = await prisma.monitorAlert.create({
            data: {
              monitorId: monitor.id,
              stampId: stamp.id,
              sourceUrl: result.url,
              sourceName: result.domain || 'External',
              matchType: result.matchLevel === 'full' ? 'exact_match' : 'partial_match',
              confidence: result.score || 0.7,
              sourceEngine: result.engine,
              externalId: result.externalId,
            },
          });
          newAlerts.push(alert);
          try {
            await sendMonitorAlertEmail({
              userId: req.user.userId,
              userEmail: passport.user?.email,
              displayName: passport.displayName,
              stamp,
              alert,
            });
          } catch (mailErr) {
            console.warn('Alert email failed:', mailErr.message);
          }
        }
      }
    } catch (extErr) {
      console.warn('External scan failed (non-fatal):', extErr.message);
    }

    await prisma.monitor.update({
      where: { id: monitor.id },
      data: {
        lastScanAt: new Date(),
        nextScanAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        matchCount: { increment: newAlerts.length },
      },
    });

    for (const alert of newAlerts) {
      setImmediate(() => {
        const alertPayload = {
          alertId: alert.id,
          stampId: stamp.id,
          monitorId: monitor.id,
          matchType: alert.matchType,
          sourceUrl: alert.sourceUrl,
          sourceEngine: alert.sourceEngine,
          confidence: alert.confidence,
        };
        notifyWebhook(passport.id, 'monitor.alert.new', alertPayload);
        notifyWebhook(passport.id, 'monitor.alert', alertPayload);
      });
    }

    res.json({
      scanned: allOtherStamps.length,
      externalResults: externalResults.length,
      matchesFound: matches.length + externalResults.length,
      newAlerts: newAlerts.length,
      matches,
      externalMatches: externalResults,
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

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

module.exports = router;
