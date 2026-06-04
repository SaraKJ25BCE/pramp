const express = require('express');
const passport = require('passport');
const authMiddleware = require('../middleware/auth');
const prisma = require('../config/prisma');
const { issueAuthToken } = require('../utils/authTokens');
const { authMeLimiter, authRouteLimiter } = require('../middleware/rateLimiter');
const { sanitizePassport } = require('../utils/sanitizePassport');
const emailAuthRoutes = require('./emailAuth');

const router = express.Router();

router.use('/email', emailAuthRoutes);

router.get(
  '/google',
  authRouteLimiter,
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/auth/failure' }),
  (req, res) => {
    const user = req.user;
    const token = issueAuthToken(user);
    const needsSetup = user.passport?.username ? '0' : '1';
    res.redirect(`${process.env.CLIENT_URL}/auth/callback?token=${token}&needsSetup=${needsSetup}`);
  }
);

router.get('/me', authMeLimiter, authMiddleware, async (req, res) => {
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

    res.json({
      user: userData,
      passport: sanitizePassport(userPassport),
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
