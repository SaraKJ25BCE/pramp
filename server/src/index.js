const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const passport = require('passport');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const uploadsRoot = path.join(__dirname, '../uploads');
for (const sub of ['originals', 'stamped', 'certificates']) {
  fs.mkdirSync(path.join(uploadsRoot, sub), { recursive: true });
}

require('./config/passport');

const authRoutes = require('./routes/auth');
const passportRoutes = require('./routes/passport');
const stampRoutes = require('./routes/stamps');
const verifyRoutes = require('./routes/verify');
const shareRoutes = require('./routes/share');
const monitorRoutes = require('./routes/monitor');
const takedownRoutes = require('./routes/takedown');
const registryRoutes = require('./routes/registry');
const versionsRoutes = require('./routes/versions');
const tsaRoutes = require('./routes/tsa');
const legalProofRoutes = require('./routes/legalProof');
const notificationRoutes = require('./routes/notifications');
const apiVerifyRoutes = require('./routes/apiVerify');
const aiProtectionRoutes = require('./routes/aiProtection');
const embedBadgeRoutes = require('./routes/embedBadge');
const { logFairUseStartup } = require('./config/fairUse');
const { startTsaRetryJob } = require('./jobs/tsaRetry');
const { startWebhookRetryJob } = require('./jobs/webhookRetry');
const { startBlockchainAnchorJob } = require('./jobs/blockchainAnchor');
const { startOtsUpgradeJob } = require('./jobs/otsUpgrade');
const { startAuditHeadGithubJob } = require('./jobs/auditHeadGithub');
const { startScheduledScanner } = require('./jobs/scheduledScanner');
const { startAIRegistryScanJob } = require('./jobs/aiRegistryScan');
const { getPlatformPublicKeyPem } = require('./services/platformSigning');

const {
  globalLimiter,
  stampRouteLimiter,
  stampCreatePerUserLimiter,
  verifyLimiter,
} = require('./middleware/rateLimiter');

const app = express();

if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: false,
  }),
);
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(morgan('dev'));
app.use(express.json());
app.use(passport.initialize());
app.use(globalLimiter); // high ceiling; OAuth/static paths skipped — see rateLimiter.js


app.use('/share', cors());
app.use('/registry', cors());
app.use('/embed', cors({ origin: '*' }), embedBadgeRoutes);
app.use('/uploads', cors(), (req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noai, noimageai');
  res.setHeader('Content-Disposition', 'attachment');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(uploadsRoot));

app.use('/auth', authRoutes);
app.use('/passport', passportRoutes);
app.use('/stamps', stampRouteLimiter, stampRoutes);
app.use('/verify', verifyLimiter, verifyRoutes);
app.use('/share', shareRoutes);
app.use('/monitor', monitorRoutes);
app.use('/takedowns', takedownRoutes);
app.use('/registry', registryRoutes);
app.use('/versions', versionsRoutes);
app.use('/tsa', tsaRoutes);
app.use('/legal', legalProofRoutes);
app.use('/notifications', notificationRoutes);
app.use('/api/verify', apiVerifyRoutes);
app.use('/api/ai-protection', aiProtectionRoutes);

app.get('/ai.txt', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(`# ProofStamp AI Training Policy
# https://proofstamp.app
#
# This file declares AI/ML training restrictions for content hosted on this domain.
# Works registered on ProofStamp with AI opt-out enabled may NOT be used for
# training machine learning models without explicit written permission from the creator.
#
# For programmatic lookup, use our registry API:
#   GET /registry/check?hash=<sha256>&phash=<perceptual_hash>
#   GET /registry/bulk (paginated export)
#
# Contact: support@proofstamp.app

User-Agent: *
Disallow-Training: /uploads/
Disallow-Training: /share/*/og-image

User-Agent: GPTBot
Disallow-Training: /

User-Agent: CCBot
Disallow-Training: /

User-Agent: Google-Extended
Disallow-Training: /

User-Agent: anthropic-ai
Disallow-Training: /

User-Agent: ClaudeBot
Disallow-Training: /

User-Agent: cohere-ai
Disallow-Training: /
`);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/.well-known/platform-public-key.pem', (req, res) => {
  res.setHeader('Content-Type', 'application/x-pem-file');
  res.send(getPlatformPublicKeyPem());
});

app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large (max 100MB)' });
  }
  if (err.message && err.message.includes('File type')) {
    return res.status(415).json({ error: err.message });
  }
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

const { connectDatabase } = require('./config/prisma');

const PORT = process.env.PORT || 3001;

connectDatabase()
  .then(() => {
    logFairUseStartup();
    startScheduledScanner();
    startTsaRetryJob();
    startWebhookRetryJob();
    startAuditHeadGithubJob();
    startAIRegistryScanJob();
    if (process.env.BLOCKCHAIN_ANCHOR_DISABLED !== 'true') {
      startBlockchainAnchorJob();
      startOtsUpgradeJob();
    }
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to database:', err.message);
    process.exit(1);
  });
