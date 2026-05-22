const rateLimit = require('express-rate-limit');
const { resolveFairUseMonthly, isQuotaFullyDisabled } = require('../config/fairUse');

/**
 * Production-oriented rate limits: protect abuse paths without blocking normal use.
 * Limits are per IP (set trust proxy on app when behind nginx/load balancer).
 */

function createLimiter({ windowMs, max, message, skip }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
    skip: skip || (() => false),
  });
}

/** Safety net for anonymous abuse — skips static assets and OAuth redirects */
const globalLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || '2000', 10),
  message: 'Too many requests, please try again later',
  skip: (req) => {
    const p = req.path || '';
    if (p.startsWith('/uploads')) return true;
    if (p.startsWith('/share')) return true;
    if (p.startsWith('/registry')) return true;
    if (p.startsWith('/embed')) return true;
    if (p.startsWith('/auth/google')) return true;
    if (p === '/auth/failure') return true;
    return false;
  },
});

/** Stamp creation only — not GET polling */
const stampWriteLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_STAMP_WRITE_MAX || '30', 10),
  message: 'Too many stamp requests, please wait a moment',
});

/** Stamp reads (detail, proof bundle) — generous for UI polling */
const stampReadLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_STAMP_READ_MAX || '300', 10),
  message: 'Too many requests, please slow down',
});

const verifyLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_VERIFY_MAX || '60', 10),
  message: 'Too many verification requests, please wait a moment',
});

/** Email OTP send — anti-spam */
const emailSendCodeLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_EMAIL_SEND_MAX || '15', 10),
  message: 'Too many verification emails requested. Try again in a few minutes.',
});

/** Email OTP verify attempts per IP */
const emailVerifyCodeLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_EMAIL_VERIFY_MAX || '40', 10),
  message: 'Too many verification attempts. Try again later.',
});

/** Session refresh / auth/me */
const authMeLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_AUTH_ME_MAX || '300', 10),
  message: 'Too many requests, please try again later',
});

function stampRouteLimiter(req, res, next) {
  if (req.method === 'POST') return stampWriteLimiter(req, res, next);
  if (req.method === 'GET') return stampReadLimiter(req, res, next);
  return next();
}

async function countMonthlyStamps(passportId) {
  const prisma = require('../config/prisma');
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  return prisma.stamp.count({
    where: {
      passportId,
      createdAt: { gte: startOfMonth },
    },
  });
}

async function enforceStampQuota(req, res, next) {
  if (isQuotaFullyDisabled()) {
    return next();
  }
  return enforceFairUse(req, res, next);
}

async function enforceFairUse(req, res, next) {
  try {
    const prisma = require('../config/prisma');
    const passport = await prisma.passport.findUnique({
      where: { userId: req.user.userId },
    });
    if (!passport) return next();

    const limit = resolveFairUseMonthly();
    const monthlyCount = await countMonthlyStamps(passport.id);
    if (monthlyCount >= limit) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      return res.status(429).json({
        error: `Monthly fair-use limit reached (${limit} stamps/month)`,
        stampsUsed: monthlyCount,
        limit,
        stampsRemaining: 0,
        resetsAt: new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 1).toISOString(),
      });
    }

    req.stampsRemaining = limit - monthlyCount;
    next();
  } catch (error) {
    console.error('Fair-use check failed:', error);
    next();
  }
}

module.exports = {
  globalLimiter,
  stampWriteLimiter,
  stampReadLimiter,
  stampRouteLimiter,
  verifyLimiter,
  emailSendCodeLimiter,
  emailVerifyCodeLimiter,
  authMeLimiter,
  enforceStampQuota,
  enforceFairUse,
  isFairUseEnabled: () => !isQuotaFullyDisabled(),
};
