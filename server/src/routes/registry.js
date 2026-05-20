const express = require('express');
const prisma = require('../config/prisma');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Public: Check if a specific hash is in the opt-out registry
router.get('/check', async (req, res) => {
  try {
    const { hash, phash } = req.query;

    if (!hash && !phash) {
      return res.status(400).json({ error: 'Provide ?hash= (SHA-256) or ?phash= (perceptual hash)' });
    }

    let match = null;

    if (hash) {
      match = await prisma.stamp.findFirst({
        where: { originalHash: hash, aiOptOut: true },
        select: {
          id: true, title: true, license: true, createdAt: true, aiOptOut: true,
          passport: { select: { username: true, displayName: true } },
        },
      });
    }

    if (!match && phash) {
      const candidates = await prisma.stamp.findMany({
        where: { aiOptOut: true, pHash: { not: null } },
        select: { id: true, title: true, license: true, pHash: true, createdAt: true,
                  passport: { select: { username: true, displayName: true } } },
      });

      for (const candidate of candidates) {
        if (hammingDistance(phash, candidate.pHash) < 18) {
          match = candidate;
          break;
        }
      }
    }

    if (match) {
      res.setHeader('X-AI-Training', 'PROHIBITED');
      return res.json({
        optedOut: true,
        stampId: match.id,
        title: match.title,
        creator: match.passport.displayName,
        creatorHandle: `@${match.passport.username}`,
        license: match.license,
        registeredAt: match.createdAt,
        notice: 'This work is registered in the ProofStamp AI Training Opt-Out Registry. Use for AI/ML training without explicit written permission from the creator is prohibited.',
        legal: 'Unauthorized use may violate copyright law and the creator\'s explicitly stated license terms.',
      });
    }

    res.json({ optedOut: false, notice: 'No matching work found in the opt-out registry.' });
  } catch (error) {
    console.error('Registry check error:', error);
    res.status(500).json({ error: 'Registry check failed' });
  }
});

// Public: Get registry stats
router.get('/stats', async (req, res) => {
  try {
    const totalOptedOut = await prisma.stamp.count({ where: { aiOptOut: true } });
    const totalCreators = await prisma.passport.count({
      where: { stamps: { some: { aiOptOut: true } } },
    });

    res.json({
      registry: 'ProofStamp AI Training Opt-Out Registry',
      version: '1.0',
      totalProtectedWorks: totalOptedOut,
      totalCreators,
      lastUpdated: new Date().toISOString(),
      apiDocs: '/api/registry/docs',
      checkEndpoint: '/api/registry/check?hash=<sha256>&phash=<perceptual_hash>',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Public: Machine-readable bulk export for AI companies to check
router.get('/bulk', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const skip = (page - 1) * limit;

    const total = await prisma.stamp.count({ where: { aiOptOut: true } });
    const stamps = await prisma.stamp.findMany({
      where: { aiOptOut: true },
      select: {
        id: true,
        originalHash: true,
        pHash: true,
        title: true,
        license: true,
        category: true,
        createdAt: true,
        passport: { select: { username: true } },
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      registry: 'ProofStamp AI Training Opt-Out Registry',
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      works: stamps.map(s => ({
        stampId: s.id,
        sha256: s.originalHash,
        pHash: s.pHash,
        title: s.title,
        creator: `@${s.passport.username}`,
        license: s.license,
        category: s.category,
        registeredAt: s.createdAt,
        optOutStatus: 'PROHIBITED',
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to export registry' });
  }
});

// Public: robots.txt style declaration
router.get('/declaration.txt', async (req, res) => {
  try {
    const count = await prisma.stamp.count({ where: { aiOptOut: true } });
    const text = `# ProofStamp AI Training Opt-Out Registry
# https://proofstamp.io/registry
# 
# This file declares that ${count} creative works registered with ProofStamp
# have been explicitly opted out of AI/ML training by their creators.
#
# AI companies: Query our API to check individual works before training.
# Endpoint: GET /api/registry/check?hash=<sha256>&phash=<perceptual_hash>
# Bulk: GET /api/registry/bulk?page=1&limit=100
#
# Compliance: Using opted-out works for training may violate:
# - The creator's copyright and license terms
# - Applicable data protection regulations
# - Fair use limitations (commercial AI training)
#
# Contact: registry@proofstamp.io

User-agent: *
AI-Training: PROHIBITED for all works listed in this registry
Registry-Size: ${count}
Last-Updated: ${new Date().toISOString()}
API-Check: ${process.env.CLIENT_URL ? process.env.CLIENT_URL.replace('localhost:5173', 'api.proofstamp.io') : 'https://api.proofstamp.io'}/registry/check
`;
    res.setHeader('Content-Type', 'text/plain');
    res.send(text);
  } catch (error) {
    res.status(500).send('Error generating declaration');
  }
});

// Authenticated: Toggle opt-out for own stamps
router.patch('/opt/:stampId', authMiddleware, async (req, res) => {
  try {
    const { aiOptOut } = req.body;
    const passport = await prisma.passport.findUnique({ where: { userId: req.user.userId } });
    if (!passport) return res.status(404).json({ error: 'Passport not found' });

    const stamp = await prisma.stamp.findUnique({ where: { id: req.params.stampId } });
    if (!stamp) return res.status(404).json({ error: 'Stamp not found' });
    if (stamp.passportId !== passport.id) return res.status(403).json({ error: 'Not your stamp' });

    const updated = await prisma.stamp.update({
      where: { id: req.params.stampId },
      data: { aiOptOut: aiOptOut !== false },
    });

    res.json({ stampId: updated.id, aiOptOut: updated.aiOptOut });
  } catch (error) {
    console.error('Error toggling opt-out:', error);
    res.status(500).json({ error: 'Failed to update opt-out status' });
  }
});

function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return Infinity;
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const b1 = parseInt(hash1[i], 16);
    const b2 = parseInt(hash2[i], 16);
    let xor = b1 ^ b2;
    while (xor) { distance += xor & 1; xor >>= 1; }
  }
  return distance;
}

module.exports = router;
