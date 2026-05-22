const express = require('express');
const authOrApiKey = require('../middleware/authOrApiKey');
const prisma = require('../config/prisma');

const router = express.Router();

router.get('/', authOrApiKey, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
    const notifications = await prisma.userNotification.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const unreadCount = await prisma.userNotification.count({
      where: { userId: req.user.userId, read: false },
    });
    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error('Notifications list error:', err);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

router.post('/:id/read', authOrApiKey, async (req, res) => {
  try {
    const updated = await prisma.userNotification.updateMany({
      where: { id: req.params.id, userId: req.user.userId },
      data: { read: true },
    });
    if (!updated.count) return res.status(404).json({ error: 'Notification not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark read' });
  }
});

router.post('/read-all', authOrApiKey, async (req, res) => {
  try {
    await prisma.userNotification.updateMany({
      where: { userId: req.user.userId, read: false },
      data: { read: true },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark all read' });
  }
});

module.exports = router;
