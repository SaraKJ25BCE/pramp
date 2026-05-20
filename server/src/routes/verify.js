const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const upload = require('../middleware/upload');
const prisma = require('../config/prisma');

const router = express.Router();

const PHASH_THRESHOLD = 18;

function computeHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return Infinity;
  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const b1 = parseInt(hash1[i], 16);
    const b2 = parseInt(hash2[i], 16);
    let xor = b1 ^ b2;
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

function categorizeFile(mimetype) {
  if (mimetype.startsWith('image/') && !mimetype.includes('svg')) return 'image';
  return 'other';
}

router.post('/file', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    const uploadedHash = computeHash(file.buffer);
    const isImage = categorizeFile(file.mimetype) === 'image';

    // Layer 1: Exact SHA-256 match (works for ALL file types)
    const exactMatch = await prisma.stamp.findFirst({
      where: {
        OR: [
          { originalHash: uploadedHash },
          { stampedHash: uploadedHash },
        ],
      },
      include: {
        passport: {
          include: { user: { select: { avatarUrl: true } } },
        },
      },
    });

    if (exactMatch) {
      const { passport: passportData, ...stampData } = exactMatch;
      const { privateKey, ...safePassport } = passportData;
      return res.json({
        outcome: 'A',
        message: 'This file is authentic and verified (exact byte-for-byte match)',
        stamp: stampData,
        passport: safePassport,
        confidence: 'exact',
      });
    }

    // Layer 2: Perceptual hash matching (images only)
    if (isImage) {
      const hashFormData = new FormData();
      hashFormData.append('file', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });

      let uploadedPHash = null;
      let uploadedDHash = null;
      try {
        const hashResponse = await axios.post(
          `${process.env.STEGO_SERVICE_URL}/hash`,
          hashFormData,
          { headers: hashFormData.getHeaders(), timeout: 30000 }
        );
        uploadedPHash = hashResponse.data.pHash;
        uploadedDHash = hashResponse.data.dHash;
      } catch (err) {
        console.error('Hash computation failed:', err.message);
      }

      if (uploadedPHash || uploadedDHash) {
        const allStamps = await prisma.stamp.findMany({
          where: { pHash: { not: null } },
          include: {
            passport: {
              include: { user: { select: { avatarUrl: true } } },
            },
          },
        });

        let matchedStamp = null;
        let matchDistance = Infinity;

        for (const stamp of allStamps) {
          const pDist = hammingDistance(uploadedPHash, stamp.pHash);
          const dDist = hammingDistance(uploadedDHash, stamp.dHash);
          const bestDist = Math.min(pDist, dDist);
          if (bestDist < PHASH_THRESHOLD && bestDist < matchDistance) {
            matchDistance = bestDist;
            matchedStamp = stamp;
          }
        }

        if (matchedStamp) {
          const { passport: passportData, ...stampData } = matchedStamp;
          const { privateKey, ...safePassport } = passportData;
          return res.json({
            outcome: 'A',
            message: 'This file is authentic — content matches a stamped file (format/compression may differ)',
            stamp: stampData,
            passport: safePassport,
            confidence: matchDistance <= 5 ? 'high' : 'medium',
            matchDistance,
          });
        }
      }

      // Layer 3: DWT-DCT watermark extraction (images only)
      const extractFormData = new FormData();
      extractFormData.append('file', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });

      try {
        const stegoResponse = await axios.post(
          `${process.env.STEGO_SERVICE_URL}/extract`,
          extractFormData,
          { headers: extractFormData.getHeaders(), timeout: 60000 }
        );

        if (stegoResponse.data.found) {
          const stamp = await prisma.stamp.findUnique({
            where: { id: stegoResponse.data.stamp_id },
            include: {
              passport: {
                include: { user: { select: { avatarUrl: true } } },
              },
            },
          });

          if (stamp) {
            const { passport: passportData, ...stampData } = stamp;
            const { privateKey, ...safePassport } = passportData;
            return res.json({
              outcome: 'A',
              message: 'This file is authentic — verified via embedded watermark',
              stamp: stampData,
              passport: safePassport,
              confidence: 'watermark',
            });
          }
        }
      } catch (err) {
        console.error('Watermark extraction error:', err.message);
      }
    }

    // Nothing found
    return res.json({
      outcome: 'C',
      message: 'No ProofStamp found on this file',
      stamp: null,
      passport: null,
    });
  } catch (error) {
    console.error('Error verifying file:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

router.get('/:stampId', async (req, res) => {
  try {
    const stamp = await prisma.stamp.findUnique({
      where: { id: req.params.stampId },
      include: {
        passport: {
          include: { user: { select: { avatarUrl: true } } },
        },
      },
    });

    if (!stamp) {
      return res.status(404).json({ error: 'Stamp not found' });
    }

    const { passport: passportData, ...stampData } = stamp;
    const { privateKey, ...safePassport } = passportData;

    res.json({
      outcome: 'A',
      message: 'Stamp record found and verified',
      stamp: stampData,
      passport: safePassport,
    });
  } catch (error) {
    console.error('Error verifying stamp:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
