const express = require('express');
const authMiddleware = require('../middleware/auth');
const prisma = require('../config/prisma');

const router = express.Router();

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

    const { privateKey, ...passportData } = updated;
    res.json({ passport: passportData });
  } catch (error) {
    console.error('Error updating username:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const passportRecord = await prisma.passport.findUnique({
      where: { userId: req.user.userId },
      include: {
        stamps: { orderBy: { createdAt: 'desc' } },
        user: { select: { email: true, avatarUrl: true } },
      },
    });

    if (!passportRecord) {
      return res.status(404).json({ error: 'Passport not found' });
    }

    const { privateKey, ...passportData } = passportRecord;
    res.json({ passport: passportData });
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

    const { privateKey, ...passportData } = passportRecord;
    res.json({ passport: passportData });
  } catch (error) {
    console.error('Error fetching passport:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
