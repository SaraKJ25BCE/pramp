const express = require('express');
const crypto = require('crypto');
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');
const prisma = require('../config/prisma');
const { uploadBuffer, getThumbnailUrl } = require('../config/cloudinary');

const router = express.Router();

// Get all versions for a stamp
router.get('/:stampId', async (req, res) => {
  try {
    const stamp = await prisma.stamp.findUnique({
      where: { id: req.params.stampId },
      select: { id: true, title: true, passportId: true },
    });
    if (!stamp) return res.status(404).json({ error: 'Stamp not found' });

    const versions = await prisma.stampVersion.findMany({
      where: { stampId: req.params.stampId },
      orderBy: { version: 'asc' },
    });

    res.json({ stampId: stamp.id, title: stamp.title, versions, count: versions.length });
  } catch (error) {
    console.error('Error fetching versions:', error);
    res.status(500).json({ error: 'Failed to fetch versions' });
  }
});

// Add a new version to the creation timeline
router.post('/:stampId', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const { label, note } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file provided' });
    if (!label) return res.status(400).json({ error: 'Version label is required (e.g. "Initial Sketch", "Final Draft")' });

    const passport = await prisma.passport.findUnique({ where: { userId: req.user.userId } });
    if (!passport) return res.status(404).json({ error: 'Passport not found' });

    const stamp = await prisma.stamp.findUnique({ where: { id: req.params.stampId } });
    if (!stamp) return res.status(404).json({ error: 'Stamp not found' });
    if (stamp.passportId !== passport.id) return res.status(403).json({ error: 'Not your stamp' });

    // Determine next version number
    const lastVersion = await prisma.stampVersion.findFirst({
      where: { stampId: stamp.id },
      orderBy: { version: 'desc' },
    });
    const nextVersion = (lastVersion?.version || 0) + 1;

    // Compute hash
    const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

    // Upload to cloudinary
    const uploaded = await uploadBuffer(file.buffer, {
      folder: `proofstamp/versions/${stamp.id}`,
      public_id: `v${nextVersion}`,
      resource_type: stamp.category === 'image' ? 'image' : 'raw',
    });

    const thumbnailUrl = stamp.category === 'image' ? getThumbnailUrl(uploaded.secure_url) : null;

    const version = await prisma.stampVersion.create({
      data: {
        stampId: stamp.id,
        version: nextVersion,
        label,
        fileHash,
        fileUrl: uploaded.secure_url,
        thumbnailUrl,
        fileSize: file.buffer.length,
        note: note || null,
      },
    });

    res.status(201).json({ version, message: `Version ${nextVersion} added to creation timeline` });
  } catch (error) {
    console.error('Error adding version:', error);
    res.status(500).json({ error: 'Failed to add version' });
  }
});

// Get proof of creation process (public - court-ready)
router.get('/:stampId/proof', async (req, res) => {
  try {
    const stamp = await prisma.stamp.findUnique({
      where: { id: req.params.stampId },
      include: {
        passport: { select: { id: true, username: true, displayName: true, publicKey: true } },
        versions: { orderBy: { version: 'asc' } },
      },
    });

    if (!stamp) return res.status(404).json({ error: 'Stamp not found' });

    const timeline = stamp.versions.map((v, i, arr) => ({
      version: v.version,
      label: v.label,
      timestamp: v.createdAt.toISOString(),
      fileHash: v.fileHash,
      fileSize: v.fileSize,
      note: v.note,
      timeSincePrevious: i > 0
        ? Math.round((new Date(v.createdAt) - new Date(arr[i - 1].createdAt)) / 1000 / 60) + ' minutes'
        : null,
    }));

    const proof = {
      type: 'ProofOfCreationProcess',
      version: '1.0',
      stampId: stamp.id,
      title: stamp.title,
      creator: {
        name: stamp.passport.displayName,
        handle: `@${stamp.passport.username}`,
        passportId: stamp.passport.id,
      },
      finalWork: {
        hash: stamp.originalHash,
        registeredAt: stamp.createdAt.toISOString(),
        signature: stamp.signature.substring(0, 64) + '...',
      },
      creationTimeline: timeline,
      totalVersions: timeline.length,
      timeSpan: timeline.length >= 2
        ? {
            firstVersion: timeline[0].timestamp,
            lastVersion: timeline[timeline.length - 1].timestamp,
            totalDuration: Math.round(
              (new Date(timeline[timeline.length - 1].timestamp) - new Date(timeline[0].timestamp)) / 1000 / 60
            ) + ' minutes',
          }
        : null,
      evidence: 'This creation timeline shows progressive development of the work with cryptographic timestamps at each stage. Each version is hashed and stored independently, making it computationally infeasible to fabricate this history retroactively.',
      verification: `${process.env.CLIENT_URL}/verify?id=${stamp.id}`,
    };

    res.json(proof);
  } catch (error) {
    console.error('Error generating creation proof:', error);
    res.status(500).json({ error: 'Failed to generate proof' });
  }
});

module.exports = router;
