const express = require('express');
const crypto = require('crypto');
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');
const prisma = require('../config/prisma');
const { uploadBuffer, getThumbnailUrl } = require('../config/cloudinary');
const { decryptPrivateKey, signData } = require('../utils/crypto');

const router = express.Router();

function computeChainHash(version, fileHash, prevHash, timestamp) {
  const payload = `${version}|${fileHash}|${prevHash || ''}|${timestamp}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

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

    const lastVersion = await prisma.stampVersion.findFirst({
      where: { stampId: stamp.id },
      orderBy: { version: 'desc' },
    });
    const nextVersion = (lastVersion?.version || 0) + 1;

    const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

    const prevHash = lastVersion?.chainHash || lastVersion?.fileHash || null;
    const timestamp = new Date().toISOString();
    const chainHash = computeChainHash(nextVersion, fileHash, prevHash, timestamp);

    const privateKey = decryptPrivateKey(passport.privateKey);
    const signPayload = `${stamp.id}|v${nextVersion}|${fileHash}|${chainHash}|${timestamp}`;
    const signature = signData(signPayload, privateKey);

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
        prevHash,
        chainHash,
        signature,
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

// Get proof of creation process (public — admissibility-oriented evidence)
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
      prevHash: v.prevHash || null,
      chainHash: v.chainHash || null,
      signature: v.signature || null,
      fileSize: v.fileSize,
      note: v.note,
      timeSincePrevious: i > 0
        ? Math.round((new Date(v.createdAt) - new Date(arr[i - 1].createdAt)) / 1000 / 60) + ' minutes'
        : null,
    }));

    let chainValid = true;
    for (let i = 0; i < timeline.length; i++) {
      const v = timeline[i];
      if (v.chainHash) {
        const expectedPrev = i > 0 ? (timeline[i - 1].chainHash || timeline[i - 1].fileHash) : null;
        if (v.prevHash !== expectedPrev) {
          chainValid = false;
          break;
        }
        const recomputed = computeChainHash(v.version, v.fileHash, v.prevHash, v.timestamp);
        if (recomputed !== v.chainHash) {
          chainValid = false;
          break;
        }
      }
    }

    const proof = {
      type: 'ProofOfCreationProcess',
      version: '2.0',
      stampId: stamp.id,
      title: stamp.title,
      creator: {
        name: stamp.passport.displayName,
        handle: `@${stamp.passport.username}`,
        passportId: stamp.passport.id,
        publicKey: stamp.passport.publicKey,
      },
      finalWork: {
        hash: stamp.originalHash,
        registeredAt: stamp.createdAt.toISOString(),
        signature: stamp.signature,
      },
      creationTimeline: timeline,
      chainIntegrity: {
        valid: chainValid,
        algorithm: 'SHA-256(version|fileHash|prevHash|timestamp)',
        signatureAlgorithm: 'RSA-SHA256 over stampId|version|fileHash|chainHash|timestamp',
      },
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
      verification: {
        url: `${process.env.CLIENT_URL}/verify?id=${stamp.id}`,
        instructions: 'To verify this proof: (1) Recompute each chainHash using SHA-256(version|fileHash|prevHash|timestamp). (2) Verify each RSA signature using the creator\'s public key above. (3) Confirm the chain is unbroken (each prevHash matches the prior chainHash).',
      },
      evidence: 'This creation timeline shows progressive development of the work with a cryptographically chained hash sequence and per-version RSA signatures. Each version references the previous via SHA-256 chain hashes, making retroactive insertion or reordering computationally infeasible.',
    };

    const proofJson = JSON.stringify(proof);
    const documentHash = crypto.createHash('sha256').update(proofJson).digest('hex');
    proof.documentHash = documentHash;

    res.json(proof);
  } catch (error) {
    console.error('Error generating creation proof:', error);
    res.status(500).json({ error: 'Failed to generate proof' });
  }
});

module.exports = router;
