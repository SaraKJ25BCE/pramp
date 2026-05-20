const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');
const prisma = require('../config/prisma');

const router = express.Router();

router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/auth/failure' }),
  (req, res) => {
    const user = req.user;
    const token = jwt.sign(
      {
        userId: user.id,
        passportId: user.passport?.id,
        username: user.passport?.username,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.redirect(`${process.env.CLIENT_URL}/auth/callback?token=${token}`);
  }
);

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: {
        passport: {
          include: {
            stamps: { orderBy: { createdAt: 'desc' }, take: 5 },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { passport: userPassport, ...userData } = user;
    const { privateKey, ...passportData } = userPassport || {};

    res.json({
      user: userData,
      passport: passportData,
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/failure', (req, res) => {
  res.redirect(`${process.env.CLIENT_URL}/login?error=auth_failed`);
});

module.exports = router;
