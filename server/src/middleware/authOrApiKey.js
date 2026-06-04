const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

/**
 * Accept Bearer JWT or X-ProofStamp-Api-Key / X-Api-Key for stamp API automation.
 */
async function authOrApiKey(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  const rawKey =
    req.headers['x-proofstamp-api-key'] ||
    req.headers['x-api-key'];
  if (rawKey) {
    try {
      const keyStr = String(rawKey);
      const prefix = keyStr.slice(0, 8);
      const candidates = await prisma.apiKey.findMany({
        where: { keyPrefix: prefix },
        include: { passport: true },
        take: 10,
      });

      let record = null;
      for (const candidate of candidates) {
        const match = candidate.keyHash.startsWith('$2')
          ? await bcrypt.compare(keyStr, candidate.keyHash)
          : candidate.keyHash === require('crypto').createHash('sha256').update(keyStr, 'utf8').digest('hex');
        if (match) {
          record = candidate;
          break;
        }
      }
      if (!record) return res.status(401).json({ error: 'Invalid API key' });

      await prisma.apiKey.update({
        where: { id: record.id },
        data: { lastUsedAt: new Date() },
      });

      req.user = {
        userId: record.passport.userId,
        passportId: record.passport.id,
      };
      req.apiKeyAuth = true;
      return next();
    } catch (err) {
      console.error('API key lookup failed:', err);
      return res.status(401).json({ error: 'Invalid API key' });
    }
  }

  return res.status(401).json({ error: 'No credentials provided — use Bearer token or API key header' });
}

module.exports = authOrApiKey;
