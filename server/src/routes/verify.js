const express = require('express');
const crypto = require('crypto');
const { logAudit } = require('../services/auditLog');
const axios = require('axios');
const FormData = require('form-data');
const upload = require('../middleware/upload');
const prisma = require('../config/prisma');
const { computeHash, hammingDistance } = require('../utils/crypto');
const { verifyStampSignature, verifyProofChain } = require('../services/stampVerify');
const { isValidStampId } = require('../utils/stampId');
const { sanitizePassport } = require('../utils/sanitizePassport');

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

const router = express.Router();

const PHASH_EXACT = 0;
const PHASH_HIGH = 5;
const PHASH_MEDIUM = 12;
const PHASH_LOW = 18;

function stripPrivateKey(passport) {
  return sanitizePassport(passport);
}

router.post('/file', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });

    const uploadedHash = computeHash(file.buffer);
    const isImage = file.mimetype.startsWith('image/') && !file.mimetype.includes('svg');

    let c2paManifest = null;
    if (isImage) {
      try {
        const c2paFormData = new FormData();
        c2paFormData.append('file', file.buffer, {
          filename: file.originalname,
          contentType: file.mimetype,
        });
        const c2paResponse = await axios.post(
          `${process.env.STEGO_SERVICE_URL}/c2pa/read`,
          c2paFormData,
          { headers: c2paFormData.getHeaders(), timeout: 10000 }
        );
        if (c2paResponse.data.has_manifest) {
          c2paManifest = c2paResponse.data.manifest;
        }
      } catch (err) {
        console.error('C2PA read failed:', err.message);
      }
    }

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
      const sigResult = verifyStampSignature(exactMatch, exactMatch.passport);
      const chainResult = verifyProofChain(exactMatch);

      return res.json({
        outcome: 'A',
        message: 'This file is authentic and verified (exact byte-for-byte match)',
        stamp: { ...exactMatch, passport: undefined },
        passport: stripPrivateKey(exactMatch.passport),
        confidence: 'exact',
        c2pa: c2paManifest,
        verification: {
          signatureValid: sigResult.verified,
          proofChainValid: chainResult.valid,
        },
      });
    }

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
          if (bestDist <= PHASH_LOW && bestDist < matchDistance) {
            matchDistance = bestDist;
            matchedStamp = stamp;
          }
        }

        if (matchedStamp) {
          let confidence;
          if (matchDistance === PHASH_EXACT) confidence = 'exact';
          else if (matchDistance <= PHASH_HIGH) confidence = 'high';
          else if (matchDistance <= PHASH_MEDIUM) confidence = 'medium';
          else confidence = 'low';

          const sigResult = verifyStampSignature(matchedStamp, matchedStamp.passport);

          return res.json({
            outcome: 'A',
            message: 'This file is authentic — content matches a stamped file (format/compression may differ)',
            stamp: { ...matchedStamp, passport: undefined },
            passport: stripPrivateKey(matchedStamp.passport),
            confidence,
            matchDistance,
            c2pa: c2paManifest,
            verification: { signatureValid: sigResult.verified },
          });
        }

        // CNN embedding fallback — catches crops, overlays, and heavier edits
        let cnnMatch = null;
        let cnnBestSim = 0;
        try {
          const embFormData = new FormData();
          embFormData.append('file', file.buffer, {
            filename: file.originalname,
            contentType: file.mimetype,
          });
          const embResponse = await axios.post(
            `${process.env.STEGO_SERVICE_URL}/embedding`,
            embFormData,
            { headers: embFormData.getHeaders(), timeout: 30000 }
          );

          if (embResponse.data?.embedding) {
            const uploadedEmb = embResponse.data.embedding;
            const stampsWithEmb = allStamps.filter(s => s.embedding?.length > 0);

            for (const stamp of stampsWithEmb) {
              const sim = cosineSimilarity(uploadedEmb, stamp.embedding);
              if (sim > cnnBestSim && sim > 0.70) {
                cnnBestSim = sim;
                cnnMatch = stamp;
              }
            }
          }
        } catch (embErr) {
          // CNN embedding check is best-effort
        }

        if (cnnMatch) {
          const confidence = cnnBestSim > 0.85 ? 'high' : 'medium';
          const sigResult = verifyStampSignature(cnnMatch, cnnMatch.passport);

          return res.json({
            outcome: 'A',
            message: 'This file is authentic — CNN embedding match detected (robust against crops/edits)',
            stamp: { ...cnnMatch, passport: undefined },
            passport: stripPrivateKey(cnnMatch.passport),
            confidence,
            matchMethod: 'cnn_embedding',
            c2pa: c2paManifest,
            verification: { signatureValid: sigResult.verified },
          });
        }
      }

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
            let conflictingEvidence = false;
            if ((uploadedPHash || uploadedDHash) && stamp.pHash) {
              const pDist = hammingDistance(uploadedPHash, stamp.pHash);
              const dDist = hammingDistance(uploadedDHash, stamp.dHash);
              const dists = [pDist, dDist].filter((d) => d !== Infinity && !Number.isNaN(d));
              const bestDist = dists.length ? Math.min(...dists) : null;
              if (bestDist !== null && bestDist > PHASH_LOW * 2) {
                conflictingEvidence = true;
              }
            }

            if (conflictingEvidence) {
              return res.json({
                outcome: 'B',
                message: 'Conflicting evidence — a watermark was detected but perceptual fingerprints do not match the referenced stamp (possible tampering or copied watermark)',
                stamp: { ...stamp, passport: undefined },
                passport: stripPrivateKey(stamp.passport),
                confidence: 'none',
                c2pa: c2paManifest,
                verification: { perceptualWatermarkConflict: true },
              });
            }

            const sigResult = verifyStampSignature(stamp, stamp.passport);

            return res.json({
              outcome: 'A',
              message: 'This file is authentic — verified via embedded watermark',
              stamp: { ...stamp, passport: undefined },
              passport: stripPrivateKey(stamp.passport),
              confidence: 'watermark',
              c2pa: c2paManifest,
              verification: { signatureValid: sigResult.verified },
            });
          }
        }
      } catch (err) {
        console.error('Watermark extraction error:', err.message);
      }
    }

    return res.json({
      outcome: 'C',
      message: 'No ProofStamp found on this file',
      stamp: null,
      passport: null,
      c2pa: c2paManifest,
    });
  } catch (error) {
    console.error('Error verifying file:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

router.get('/:stampId', async (req, res) => {
  try {
    if (!isValidStampId(req.params.stampId)) {
      return res.status(400).json({
        error: 'Invalid stamp ID format. Expected PS-YYYY-XXXXX (e.g. PS-2026-A1B2C)',
        outcome: 'C',
        message: 'Invalid stamp ID format',
        stamp: null,
        passport: null,
      });
    }

    const stamp = await prisma.stamp.findUnique({
      where: { id: req.params.stampId },
      include: {
        passport: {
          include: { user: { select: { avatarUrl: true } } },
        },
      },
    });

    if (!stamp) {
      return res.status(404).json({
        outcome: 'C',
        message: 'Stamp not found',
        stamp: null,
        passport: null,
      });
    }

    const sigResult = verifyStampSignature(stamp, stamp.passport);
    const chainResult = verifyProofChain(stamp);

    if (!sigResult.verified) {
      return res.json({
        outcome: 'B',
        message: 'Stamp record found but signature verification failed — data may have been tampered with',
        stamp: { ...stamp, passport: undefined },
        passport: stripPrivateKey(stamp.passport),
        verification: {
          signatureValid: false,
          signatureReason: sigResult.reason || 'mismatch',
          proofChainValid: chainResult.valid,
        },
      });
    }

    const baseUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3001}`;

    await logAudit(req, {
      action: 'STAMP_VERIFIED',
      stampId: stamp.id,
      passportId: stamp.passportId,
    });

    res.json({
      outcome: 'A',
      message: 'Stamp record found and cryptographically verified',
      stamp: { ...stamp, passport: undefined },
      passport: stripPrivateKey(stamp.passport),
      verification: {
        signatureValid: true,
        proofChainValid: chainResult.valid,
        tsaVerifyStatus: stamp.tsaVerifyStatus,
        tsaTimestamp: stamp.tsaTimestamp,
        tsaTier: stamp.tsaTier,
        tsaProviderName: stamp.tsaProviderName,
        hasSection63SystemCert: !!stamp.evidenceCertificateUrl,
        hasSystemCertificate: !!stamp.evidenceCertificateUrl,
        hasSection63SystemCert: !!stamp.evidenceCertificateUrl,
        creatorAttestation: {
          attested: !!stamp.creatorAttestationAt,
          cryptographicallyBound: !!(stamp.creatorAttestationSignature && stamp.creatorAttestationPayload),
          name: stamp.creatorAttestationName,
        },
        legalArtifactsUrl: `${baseUrl}/legal/${stamp.id}/artifacts`,
        apiVerifyUrl: `${baseUrl}/api/verify/${stamp.id}`,
        proofBundleUrl: `${baseUrl}/stamps/${stamp.id}/proof`,
        tsaVerifyUrl: `${baseUrl}/tsa/verify/${stamp.id}`,
      },
    });
  } catch (error) {
    console.error('Error verifying stamp:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/file-with-id', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const { stampId } = req.body;

    if (!file) return res.status(400).json({ error: 'No file provided' });
    if (!stampId) return res.status(400).json({ error: 'Stamp ID is required' });

    const stamp = await prisma.stamp.findUnique({
      where: { id: stampId },
      include: {
        passport: {
          include: { user: { select: { avatarUrl: true } } },
        },
      },
    });

    if (!stamp) {
      return res.json({
        outcome: 'C',
        message: 'Stamp ID not found',
        stamp: null,
        passport: null,
      });
    }

    const uploadedHash = computeHash(file.buffer);
    const isImage = file.mimetype.startsWith('image/') && !file.mimetype.includes('svg');

    let c2paManifest = null;
    if (isImage) {
      try {
        const c2paFormData = new FormData();
        c2paFormData.append('file', file.buffer, {
          filename: file.originalname,
          contentType: file.mimetype,
        });
        const c2paResponse = await axios.post(
          `${process.env.STEGO_SERVICE_URL}/c2pa/read`,
          c2paFormData,
          { headers: c2paFormData.getHeaders(), timeout: 10000 }
        );
        if (c2paResponse.data.has_manifest) {
          c2paManifest = c2paResponse.data.manifest;
        }
      } catch (err) {
        console.error('C2PA read failed:', err.message);
      }
    }

    if (uploadedHash === stamp.originalHash || uploadedHash === stamp.stampedHash) {
      const sigResult = verifyStampSignature(stamp, stamp.passport);
      return res.json({
        outcome: 'A',
        message: 'File matches this stamp exactly (byte-for-byte)',
        stamp: { ...stamp, passport: undefined },
        passport: stripPrivateKey(stamp.passport),
        confidence: 'exact',
        c2pa: c2paManifest,
        verification: { signatureValid: sigResult.verified },
      });
    }

    if (isImage && stamp.pHash) {
      const hashFormData = new FormData();
      hashFormData.append('file', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });

      try {
        const hashResponse = await axios.post(
          `${process.env.STEGO_SERVICE_URL}/hash`,
          hashFormData,
          { headers: hashFormData.getHeaders(), timeout: 30000 }
        );

        const pDist = hammingDistance(hashResponse.data.pHash, stamp.pHash);
        const dDist = hammingDistance(hashResponse.data.dHash, stamp.dHash);
        const bestDist = Math.min(pDist, dDist);

        if (bestDist <= PHASH_LOW) {
          let confidence;
          if (bestDist === PHASH_EXACT) confidence = 'exact';
          else if (bestDist <= PHASH_HIGH) confidence = 'high';
          else if (bestDist <= PHASH_MEDIUM) confidence = 'medium';
          else confidence = 'low';

          return res.json({
            outcome: 'A',
            message: 'File perceptually matches this stamp (format/compression may differ)',
            stamp: { ...stamp, passport: undefined },
            passport: stripPrivateKey(stamp.passport),
            confidence,
            matchDistance: bestDist,
            c2pa: c2paManifest,
          });
        }
      } catch (err) {
        console.error('Hash computation failed:', err.message);
      }
    }

    if (isImage) {
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
        if (stegoResponse.data.found && stegoResponse.data.stamp_id === stampId) {
          const sigResult = verifyStampSignature(stamp, stamp.passport);
          return res.json({
            outcome: 'A',
            message: 'Verified via embedded watermark for this Stamp ID',
            stamp: { ...stamp, passport: undefined },
            passport: stripPrivateKey(stamp.passport),
            confidence: 'watermark',
            c2pa: c2paManifest,
            verification: { signatureValid: sigResult.verified },
          });
        }
      } catch (err) {
        console.error('Watermark extract (stamp id) failed:', err.message);
      }
    }

    return res.json({
      outcome: 'B',
      message: 'Stamp ID exists but the uploaded file does not match — this may indicate tampering or a different file',
      stamp: { ...stamp, passport: undefined },
      passport: stripPrivateKey(stamp.passport),
      confidence: 'none',
      c2pa: c2paManifest,
    });
  } catch (error) {
    console.error('Error verifying file with ID:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

module.exports = router;
