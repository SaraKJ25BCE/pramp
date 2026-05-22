const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const { sendVerificationCode, isSmtpConfigured } = require('../services/email');
const { createUserWithPassport } = require('../services/userProvisioning');
const { issueAuthToken, issueSetupToken, verifySetupToken } = require('../utils/authTokens');
const { emailSendCodeLimiter, emailVerifyCodeLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function hashCode(code) {
  return bcrypt.hash(code, 10);
}

async function verifyCodeHash(code, hash) {
  return bcrypt.compare(code, hash);
}

router.post('/send-code', emailSendCodeLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const purpose = req.body.purpose === 'login' ? 'login' : 'signup';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });

    if (purpose === 'signup') {
      if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
      }
    } else if (!existing) {
      return res.status(404).json({ error: 'No account found for this email. Sign up first.' });
    }

    const code = generateCode();
    const codeHash = await hashCode(code);

    await prisma.emailVerification.deleteMany({ where: { email, purpose } });
    await prisma.emailVerification.create({
      data: {
        email,
        codeHash,
        purpose,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    await sendVerificationCode(email, code, purpose);

    res.json({
      message: 'Verification code sent',
      expiresInMinutes: 10,
      devHint: !isSmtpConfigured() ? 'SMTP not configured — check server logs for the code' : undefined,
    });
  } catch (error) {
    console.error('Send code error:', error);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

router.post('/verify-code', emailVerifyCodeLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code || '').trim();
    const purpose = req.body.purpose === 'login' ? 'login' : 'signup';

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code are required' });
    }

    const record = await prisma.emailVerification.findFirst({
      where: { email, purpose },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      return res.status(400).json({ error: 'No verification code found. Request a new one.' });
    }

    if (record.expiresAt < new Date()) {
      await prisma.emailVerification.delete({ where: { id: record.id } });
      return res.status(400).json({ error: 'Code expired. Request a new one.' });
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many attempts. Request a new code.' });
    }

    const valid = await verifyCodeHash(code, record.codeHash);
    if (!valid) {
      await prisma.emailVerification.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      return res.status(400).json({ error: 'Invalid code' });
    }

    await prisma.emailVerification.delete({ where: { id: record.id } });

    if (purpose === 'login') {
      const user = await prisma.user.findUnique({
        where: { email },
        include: { passport: true },
      });

      if (!user) {
        return res.status(404).json({ error: 'No account found. Sign up first.' });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });

      const token = issueAuthToken(user);
      return res.json({
        verified: true,
        purpose: 'login',
        token,
        needsSetup: !user.passport?.username,
        message: 'Signed in successfully',
      });
    }

    const setupToken = issueSetupToken(email, 'signup');
    res.json({
      verified: true,
      purpose: 'signup',
      setupToken,
      needsProfile: true,
      message: 'Email verified. Complete your profile.',
    });
  } catch (error) {
    console.error('Verify code error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

router.post('/complete-signup', async (req, res) => {
  try {
    const { setupToken, displayName, username } = req.body;

    if (!setupToken || !displayName) {
      return res.status(400).json({ error: 'setupToken and displayName are required' });
    }

    if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({
        error: 'Username must be 3-20 characters, letters, numbers, and underscores only',
      });
    }

    const payload = verifySetupToken(setupToken);
    if (payload.purpose !== 'signup') {
      return res.status(400).json({ error: 'Invalid signup session' });
    }

    const email = normalizeEmail(payload.email);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Account already exists. Sign in instead.' });
    }

    if (username) {
      const taken = await prisma.passport.findUnique({ where: { username } });
      if (taken) return res.status(409).json({ error: 'Username already taken' });
    }

    const user = await createUserWithPassport({
      email,
      displayName: displayName.trim(),
    });

    if (username) {
      await prisma.passport.update({
        where: { userId: user.id },
        data: { username },
      });
      user.passport.username = username;
    }

    const token = issueAuthToken(user);
    res.status(201).json({
      token,
      needsSetup: !user.passport?.username,
      message: 'Account created successfully',
    });
  } catch (error) {
    console.error('Complete signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

module.exports = router;
