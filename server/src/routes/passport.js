const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const authMiddleware = require('../middleware/auth');
const prisma = require('../config/prisma');
const { decryptPrivateKey } = require('../utils/crypto');
const { logAudit } = require('../services/auditLog');
const { SYSTEM_ATTESTATION } = require('../config/legalProof');
const { sanitizePassport } = require('../utils/sanitizePassport');
const { MAX_ENDPOINTS } = require('../services/webhooks');

const router = express.Router();

const WEBHOOK_MAX = 2048;

router.patch('/settings/webhook', authMiddleware, async (req, res) => {
  try {
    let { webhookUrl } = req.body;
    if (webhookUrl === null || webhookUrl === undefined || webhookUrl === '') {
      webhookUrl = null;
    } else if (typeof webhookUrl === 'string') {
      webhookUrl = webhookUrl.trim();
      if (webhookUrl.length > WEBHOOK_MAX) {
        return res.status(400).json({ error: 'webhook URL is too long' });
      }
      if (!/^https:\/\/.+/i.test(webhookUrl)) {
        return res.status(400).json({ error: 'webhook URL must start with https://' });
      }
    } else {
      return res.status(400).json({ error: 'Invalid webhook URL' });
    }

    const updated = await prisma.passport.update({
      where: { userId: req.user.userId },
      data: { webhookUrl },
    });

    res.json({
      webhookUrl: sanitizePassport(updated).webhookUrl,
      message: webhookUrl ? 'Webhook URL saved' : 'Webhook URL cleared',
    });
  } catch (error) {
    console.error('Error saving webhook URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api-keys', authMiddleware, async (req, res) => {
  try {
    const passport = await prisma.passport.findUnique({
      where: { userId: req.user.userId },
      include: {
        apiKeys: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            keyPrefix: true,
            createdAt: true,
            lastUsedAt: true,
          },
        },
      },
    });
    if (!passport) return res.status(404).json({ error: 'Passport not found' });
    res.json({ apiKeys: sanitizePassport(passport).apiKeys });
  } catch (error) {
    console.error('Error listing API keys:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api-keys', authMiddleware, async (req, res) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.slice(0, 80).trim() : null;

    const passportRecord = await prisma.passport.findUnique({
      where: { userId: req.user.userId },
    });
    if (!passportRecord) return res.status(404).json({ error: 'Passport not found' });

    const rawKey = crypto.randomBytes(24).toString('base64url');
    const keyPrefix = `${rawKey.slice(0, 8)}`;
    const keyHash = await bcrypt.hash(rawKey, 10);

    const created = await prisma.apiKey.create({
      data: {
        passportId: passportRecord.id,
        name: name || 'API Key',
        keyPrefix,
        keyHash,
      },
    });

    res.status(201).json({
      id: created.id,
      message: 'Store this secret now — it is never shown again.',
      apiKey: rawKey,
      keyPrefix,
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

router.get('/webhooks', authMiddleware, async (req, res) => {
  try {
    const passportRecord = await prisma.passport.findUnique({
      where: { userId: req.user.userId },
    });
    if (!passportRecord) return res.status(404).json({ error: 'Passport not found' });

    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { passportId: passportRecord.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        url: true,
        label: true,
        enabled: true,
        createdAt: true,
      },
    });

    res.json({ endpoints, maxEndpoints: MAX_ENDPOINTS });
  } catch (error) {
    console.error('Error listing webhooks:', error);
    res.status(500).json({ error: 'Failed to list webhooks' });
  }
});

router.post('/webhooks', authMiddleware, async (req, res) => {
  try {
    const { url, label } = req.body;
    if (!url || typeof url !== 'string' || !/^https:\/\/.+/i.test(url.trim())) {
      return res.status(400).json({ error: 'Webhook URL must start with https://' });
    }

    const passportRecord = await prisma.passport.findUnique({
      where: { userId: req.user.userId },
    });
    if (!passportRecord) return res.status(404).json({ error: 'Passport not found' });

    const count = await prisma.webhookEndpoint.count({
      where: { passportId: passportRecord.id },
    });
    if (count >= MAX_ENDPOINTS) {
      return res.status(400).json({ error: `Maximum ${MAX_ENDPOINTS} webhook endpoints allowed` });
    }

    const secret = crypto.randomBytes(32).toString('hex');
    const created = await prisma.webhookEndpoint.create({
      data: {
        passportId: passportRecord.id,
        url: url.trim(),
        label: typeof label === 'string' ? label.slice(0, 80) : null,
        secret,
      },
      select: { id: true, url: true, label: true, enabled: true, createdAt: true },
    });

    res.status(201).json({
      endpoint: created,
      secret,
      message: 'Store this signing secret — it is used for HMAC verification and is not shown again.',
    });
  } catch (error) {
    console.error('Error creating webhook:', error);
    res.status(500).json({ error: 'Failed to create webhook' });
  }
});

router.delete('/webhooks/:endpointId', authMiddleware, async (req, res) => {
  try {
    const passportRecord = await prisma.passport.findUnique({
      where: { userId: req.user.userId },
    });
    if (!passportRecord) return res.status(404).json({ error: 'Passport not found' });

    await prisma.webhookEndpoint.deleteMany({
      where: { id: req.params.endpointId, passportId: passportRecord.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting webhook:', error);
    res.status(500).json({ error: 'Failed to delete webhook' });
  }
});

router.delete('/api-keys/:keyId', authMiddleware, async (req, res) => {
  try {
    const passportRecord = await prisma.passport.findUnique({
      where: { userId: req.user.userId },
    });
    if (!passportRecord) return res.status(404).json({ error: 'Passport not found' });

    await prisma.apiKey.deleteMany({
      where: {
        id: req.params.keyId,
        passportId: passportRecord.id,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

router.patch('/username', authMiddleware, async (req, res) => {
  try {
    const { username } = req.body;

    if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({
        error: 'Username must be 3-20 characters, alphanumeric and underscores only',
      });
    }

    const existing = await prisma.passport.findUnique({
      where: { username },
    });

    if (existing && existing.userId !== req.user.userId) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const updated = await prisma.passport.update({
      where: { userId: req.user.userId },
      data: { username },
    });

    res.json({ passport: sanitizePassport(updated) });
  } catch (error) {
    console.error('Error updating username:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/me/export-private-key', authMiddleware, async (req, res) => {
  try {
    const { confirm } = req.body;
    if (confirm !== 'EXPORT MY PRIVATE KEY') {
      return res.status(400).json({
        error: 'Confirmation required',
        message: 'Send { "confirm": "EXPORT MY PRIVATE KEY" } to export your creator signing key.',
      });
    }

    const passportRecord = await prisma.passport.findUnique({
      where: { userId: req.user.userId },
    });
    if (!passportRecord) return res.status(404).json({ error: 'Passport not found' });

    const privateKeyPem = decryptPrivateKey(passportRecord.privateKey, {
      userId: req.user.userId,
      passportId: passportRecord.id,
    });

    await logAudit(req, {
      action: 'PRIVATE_KEY_EXPORTED',
      passportId: passportRecord.id,
      userId: req.user.userId,
    });

    res.json({
      warning:
        'Store this key securely. Anyone with this key can sign on your behalf. ProofStamp does not retain a copy after this response.',
      algorithm: 'RSA-2048',
      format: 'PKCS#8 PEM',
      passportId: passportRecord.id,
      publicKey: passportRecord.publicKey,
      privateKey: privateKeyPem,
      systemAttestation: SYSTEM_ATTESTATION,
    });
  } catch (error) {
    console.error('Private key export error:', error);
    res.status(500).json({ error: 'Failed to export private key' });
  }
});

router.get('/me/system-attestation', async (req, res) => {
  res.json(SYSTEM_ATTESTATION);
});

router.get('/me/usage', authMiddleware, async (req, res) => {
  try {
    const passport = await prisma.passport.findUnique({
      where: { userId: req.user.userId },
    });
    if (!passport) return res.status(404).json({ error: 'Passport not found' });

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyCount = await prisma.stamp.count({
      where: {
        passportId: passport.id,
        createdAt: { gte: startOfMonth },
      },
    });

    const limit = parseInt(process.env.STAMP_FAIR_USE_MONTHLY || '0', 10);
    const quotaDisabled = process.env.STAMP_QUOTA_DISABLED === 'true';
    const { getTsaCallsThisMonth } = require('../services/tsaMetrics');

    res.json({
      stampsThisMonth: monthlyCount,
      monthlyLimit: quotaDisabled ? null : limit || null,
      stampsRemaining: quotaDisabled || !limit ? null : Math.max(0, limit - monthlyCount),
      quotaDisabled,
      tsaCallsThisMonth: getTsaCallsThisMonth(),
      resetsAt: new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 1).toISOString(),
    });
  } catch (err) {
    console.error('Usage error:', err);
    res.status(500).json({ error: 'Failed to load usage' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const passportRecord = await prisma.passport.findUnique({
      where: { userId: req.user.userId },
      include: {
        stamps: { orderBy: { createdAt: 'desc' } },
        user: { select: { email: true, avatarUrl: true, plan: true } },
        apiKeys: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            keyPrefix: true,
            createdAt: true,
            lastUsedAt: true,
          },
        },
      },
    });

    if (!passportRecord) {
      return res.status(404).json({ error: 'Passport not found' });
    }

    res.json({ passport: sanitizePassport(passportRecord) });
  } catch (error) {
    console.error('Error fetching passport:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:username', async (req, res) => {
  try {
    const passportRecord = await prisma.passport.findUnique({
      where: { username: req.params.username },
      include: {
        stamps: { orderBy: { createdAt: 'desc' } },
        user: { select: { avatarUrl: true } },
      },
    });

    if (!passportRecord) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ passport: sanitizePassport(passportRecord) });
  } catch (error) {
    console.error('Error fetching passport:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
