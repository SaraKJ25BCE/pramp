const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const QRCode = require('qrcode');
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');
const prisma = require('../config/prisma');
const { uploadBuffer, getThumbnailUrl } = require('../config/cloudinary');

const router = express.Router();

function generateStampId() {
  const year = new Date().getFullYear();
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let random = '';
  for (let i = 0; i < 5; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `PS-${year}-${random}`;
}

function categorizeFile(mimetype, filename) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype === 'application/pdf') return 'document';
  if (mimetype.startsWith('font/')) return 'font';
  if (mimetype.startsWith('model/')) return '3d';
  if (mimetype === 'application/zip' || mimetype === 'application/x-tar') return 'archive';
  if (mimetype.startsWith('text/') || mimetype === 'application/json' || mimetype === 'application/javascript') return 'code';
  if (mimetype === 'image/vnd.adobe.photoshop' || mimetype === 'application/postscript') return 'design';
  const ext = filename?.split('.').pop()?.toLowerCase();
  if (['psd', 'ai', 'sketch', 'fig'].includes(ext)) return 'design';
  if (['py', 'js', 'ts', 'jsx', 'tsx', 'go', 'rs', 'c', 'cpp', 'java', 'rb', 'php'].includes(ext)) return 'code';
  return 'other';
}

function getFileExtension(mimetype, filename) {
  const ext = filename?.split('.').pop()?.toLowerCase();
  if (ext) return ext;
  const map = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'image/svg+xml': 'svg', 'application/pdf': 'pdf', 'audio/mpeg': 'mp3',
    'audio/wav': 'wav', 'video/mp4': 'mp4', 'video/webm': 'webm',
    'text/plain': 'txt', 'application/json': 'json',
  };
  return map[mimetype] || 'bin';
}

function computeHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function buildProofChain(stampId, hash, timestamp, prevHash) {
  const block = { stampId, hash, timestamp, prevHash: prevHash || '0'.repeat(64) };
  const blockHash = crypto.createHash('sha256')
    .update(JSON.stringify(block))
    .digest('hex');
  return { ...block, blockHash };
}

async function generateCertificatePdf(stamp, passport) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const verifyUrl = `${process.env.CLIENT_URL}/verify?id=${stamp.id}`;
  const qrBuffer = await QRCode.toBuffer(verifyUrl, { width: 150 });
  const qrImage = await pdfDoc.embedPng(qrBuffer);

  page.drawText('PROOFSTAMP', {
    x: 50, y: 780, size: 28, font: fontBold, color: rgb(0.1, 0.1, 0.7),
  });
  page.drawText('Certificate of Authenticity & Ownership', {
    x: 50, y: 750, size: 14, font, color: rgb(0.3, 0.3, 0.3),
  });

  page.drawLine({ start: { x: 50, y: 735 }, end: { x: 545, y: 735 }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });

  const fields = [
    ['Stamp ID', stamp.id],
    ['Title', stamp.title],
    ['Creator', `${passport.displayName} (@${passport.username})`],
    ['Category', stamp.category.toUpperCase()],
    ['File Type', stamp.fileType.toUpperCase()],
    ['File Name', stamp.fileName || 'N/A'],
    ['File Size', stamp.fileSize ? `${(stamp.fileSize / 1024).toFixed(1)} KB` : 'N/A'],
    ['License', stamp.license],
    ['Stamped On', new Date(stamp.createdAt).toISOString()],
    ['SHA-256', stamp.originalHash.substring(0, 48) + '...'],
    ['Signature', stamp.signature.substring(0, 40) + '...'],
  ];

  let y = 700;
  for (const [label, value] of fields) {
    page.drawText(label + ':', { x: 50, y, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(String(value).substring(0, 60), { x: 170, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
    y -= 24;
  }

  // Proof chain / timestamp section
  y -= 10;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  y -= 20;
  page.drawText('TIMESTAMP PROOF', { x: 50, y, size: 11, font: fontBold, color: rgb(0.1, 0.1, 0.5) });
  y -= 18;
  page.drawText(`This document certifies that the above file existed and was registered at`, { x: 50, y, size: 9, font });
  y -= 14;
  page.drawText(`${new Date(stamp.createdAt).toISOString()} with cryptographic proof.`, { x: 50, y, size: 9, font });
  y -= 14;
  page.drawText(`Any dispute regarding ownership can be resolved by verifying the SHA-256 hash`, { x: 50, y, size: 9, font });
  y -= 14;
  page.drawText(`and RSA digital signature against the creator's public key.`, { x: 50, y, size: 9, font });

  // QR
  page.drawImage(qrImage, { x: 400, y: y - 80, width: 130, height: 130 });
  page.drawText('Scan to verify', { x: 425, y: y - 95, size: 9, font, color: rgb(0.4, 0.4, 0.4) });

  // AI Notice
  y -= 120;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  y -= 18;
  page.drawText('AI TRAINING NOTICE', { x: 50, y, size: 10, font: fontBold, color: rgb(0.7, 0.1, 0.1) });
  y -= 16;
  page.drawText(`This work is protected under ${stamp.license}. Use of this content for AI/ML`, { x: 50, y, size: 9, font });
  y -= 14;
  page.drawText(`training without explicit written permission from the creator is prohibited.`, { x: 50, y, size: 9, font });

  page.drawText('Generated by ProofStamp — cryptographic proof of creative ownership.', {
    x: 50, y: 40, size: 8, font, color: rgb(0.5, 0.5, 0.5),
  });

  return Buffer.from(await pdfDoc.save());
}

router.post('/', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const { title, description, license, clientHash } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file provided' });
    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (!license) return res.status(400).json({ error: 'License is required' });

    const category = categorizeFile(file.mimetype, file.originalname);
    const fileType = getFileExtension(file.mimetype, file.originalname);
    const isImage = category === 'image' && !file.mimetype.includes('svg');

    const serverHash = computeHash(file.buffer);
    if (clientHash && clientHash !== serverHash) {
      return res.status(400).json({ error: 'File integrity check failed — hash mismatch' });
    }

    // Parallel: duplicate check + passport + ID check + last stamp
    const [existing, passportRecord] = await Promise.all([
      prisma.stamp.findFirst({ where: { originalHash: serverHash } }),
      prisma.passport.findUnique({ where: { userId: req.user.userId } }),
    ]);

    if (existing) {
      return res.status(409).json({
        error: 'This exact file has already been stamped',
        existingStampId: existing.id,
      });
    }

    let stampId = generateStampId();

    // Save original locally (instant — milliseconds)
    const fs = require('fs');
    const path = require('path');
    const uploadsDir = path.join(__dirname, '../../uploads');
    const originalExt = fileType || 'bin';
    const originalLocalPath = path.join(uploadsDir, 'originals', `${stampId}.${originalExt}`);
    fs.writeFileSync(originalLocalPath, file.buffer);
    const localBaseUrl = `http://localhost:${process.env.PORT || 3001}`;
    const originalFileUrl = `${localBaseUrl}/uploads/originals/${stampId}.${originalExt}`;
    let thumbnailUrl = isImage ? originalFileUrl : null;

    // Parallel: stego (hash+watermark) + last stamp lookup
    let pHash = null, dHash = null, stampedBuffer = null, stampedHash = null;
    let stampedFileUrl = null;

    const parallelOps = [
      prisma.stamp.findFirst({ where: { passportId: passportRecord.id }, orderBy: { createdAt: 'desc' }, select: { id: true } }),
    ];

    if (isImage) {
      const formData = new FormData();
      formData.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype });
      formData.append('stamp_id', stampId);
      parallelOps.push(
        axios.post(`${process.env.STEGO_SERVICE_URL}/stamp`, formData, {
          headers: formData.getHeaders(), timeout: 30000,
        })
      );
    }

    const results = await Promise.all(parallelOps);
    const lastStamp = results[0];

    if (isImage && results[1]) {
      const stegoData = results[1].data;
      pHash = stegoData.pHash;
      dHash = stegoData.dHash;

      if (stegoData.stamped_base64) {
        stampedBuffer = Buffer.from(stegoData.stamped_base64, 'base64');
        stampedHash = computeHash(stampedBuffer);

        // Save stamped locally (instant)
        const stampedLocalPath = path.join(uploadsDir, 'stamped', `${stampId}.png`);
        fs.writeFileSync(stampedLocalPath, stampedBuffer);
        stampedFileUrl = `${localBaseUrl}/uploads/stamped/${stampId}.png`;
        thumbnailUrl = stampedFileUrl;
      }
    }

    // Sign (CPU — microseconds)
    const signData = `${stampId}|${passportRecord.id}|${serverHash}|${new Date().toISOString()}`;
    const sign = crypto.createSign('SHA256');
    sign.update(signData);
    const signature = sign.sign(passportRecord.privateKey, 'base64');

    const proofChain = JSON.stringify(
      buildProofChain(stampId, serverHash, new Date().toISOString(), lastStamp?.id ? computeHash(Buffer.from(lastStamp.id)) : null)
    );

    const metadata = {
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.buffer.length,
      category,
      stampedAt: new Date().toISOString(),
      protections: [
        'sha256-fingerprint', 'rsa-signature', 'timestamp-proof',
        ...(isImage ? ['perceptual-hash', 'dwt-dct-watermark'] : []),
      ],
    };

    // Create stamp record with local URLs
    const stamp = await prisma.stamp.create({
      data: {
        id: stampId,
        passportId: passportRecord.id,
        originalHash: serverHash,
        stampedHash,
        pHash,
        dHash,
        title,
        description: description || null,
        license,
        category,
        fileType,
        fileName: file.originalname,
        fileSize: file.buffer.length,
        originalFileUrl,
        stampedFileUrl,
        thumbnailUrl,
        signature,
        metadataJson: JSON.stringify(metadata),
        proofChain,
      },
    });

    // RESPOND NOW — everything else is background
    res.status(201).json({
      stamp,
      verifyUrl: `${process.env.CLIENT_URL}/verify?id=${stampId}`,
    });

    // Background: upload to Cloudinary CDN + generate certificate (non-blocking)
    (async () => {
      try {
        const uploads = [
          uploadBuffer(file.buffer, {
            folder: `proofstamp/${category}`,
            public_id: stampId + '-original',
            resource_type: isImage ? 'image' : 'raw',
          }),
        ];
        if (stampedBuffer) {
          uploads.push(uploadBuffer(stampedBuffer, {
            folder: 'proofstamp/stamped',
            public_id: stampId + '-stamped',
          }));
        }

        const [origCdn, stampedCdn] = await Promise.all(uploads);

        const cdnUpdate = {
          originalFileUrl: origCdn.secure_url,
          thumbnailUrl: isImage ? getThumbnailUrl(origCdn.secure_url) : null,
        };
        if (stampedCdn) {
          cdnUpdate.stampedFileUrl = stampedCdn.secure_url;
          cdnUpdate.thumbnailUrl = getThumbnailUrl(origCdn.secure_url);
        }

        await prisma.stamp.update({ where: { id: stampId }, data: cdnUpdate });

        // Generate and upload certificate
        const updatedStamp = await prisma.stamp.findUnique({ where: { id: stampId } });
        const certBuffer = await generateCertificatePdf(updatedStamp, passportRecord);
        const certLocalPath = path.join(uploadsDir, 'certificates', `${stampId}.pdf`);
        fs.writeFileSync(certLocalPath, certBuffer);
        await prisma.stamp.update({
          where: { id: stampId },
          data: { certificateUrl: `${localBaseUrl}/uploads/certificates/${stampId}.pdf` },
        });

        const certCdn = await uploadBuffer(certBuffer, {
          folder: 'proofstamp/certificates',
          public_id: stampId + '-cert',
          resource_type: 'raw',
        });
        await prisma.stamp.update({
          where: { id: stampId },
          data: { certificateUrl: certCdn.secure_url },
        });

        // Clean up local files after CDN upload
        try { fs.unlinkSync(originalLocalPath); } catch (e) {}
        if (stampedBuffer) {
          try { fs.unlinkSync(path.join(uploadsDir, 'stamped', `${stampId}.png`)); } catch (e) {}
        }
      } catch (err) {
        console.error('Background CDN upload failed:', err.message);
      }
    })();
  } catch (error) {
    console.error('Error creating stamp:', error);
    res.status(500).json({ error: 'Failed to create stamp' });
  }
});

// Bulk stamp multiple files
router.post('/bulk', authMiddleware, upload.array('files', 20), async (req, res) => {
  try {
    const { license, titles } = req.body;
    const files = req.files;

    if (!files || files.length === 0) return res.status(400).json({ error: 'No files provided' });

    const parsedTitles = titles ? JSON.parse(titles) : [];
    const results = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const title = parsedTitles[i] || file.originalname;
      const category = categorizeFile(file.mimetype, file.originalname);
      const fileType = getFileExtension(file.mimetype, file.originalname);
      const serverHash = computeHash(file.buffer);

      let stampId;
      let exists = true;
      while (exists) {
        stampId = generateStampId();
        exists = await prisma.stamp.findUnique({ where: { id: stampId } });
      }

      const uploadOptions = {
        folder: `proofstamp/${category}`,
        public_id: stampId + '-original',
        resource_type: category === 'image' ? 'image' : 'raw',
      };
      const originalUpload = await uploadBuffer(file.buffer, uploadOptions);

      const passportRecord = await prisma.passport.findUnique({
        where: { userId: req.user.userId },
      });

      const signData = `${stampId}|${passportRecord.id}|${serverHash}|${new Date().toISOString()}`;
      const sign = crypto.createSign('SHA256');
      sign.update(signData);
      const signature = sign.sign(passportRecord.privateKey, 'base64');

      const stamp = await prisma.stamp.create({
        data: {
          id: stampId,
          passportId: passportRecord.id,
          originalHash: serverHash,
          title,
          license: license || 'All Rights Reserved',
          category,
          fileType,
          fileName: file.originalname,
          fileSize: file.buffer.length,
          originalFileUrl: originalUpload.secure_url,
          thumbnailUrl: category === 'image' ? getThumbnailUrl(originalUpload.secure_url) : null,
          signature,
        },
      });

      results.push({ stampId: stamp.id, title, category, fileType });
    }

    res.status(201).json({ stamps: results, count: results.length });
  } catch (error) {
    console.error('Error bulk stamping:', error);
    res.status(500).json({ error: 'Bulk stamp failed' });
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

    if (!stamp) return res.status(404).json({ error: 'Stamp not found' });

    const { passport: passportData, ...stampData } = stamp;
    const { privateKey, ...safePassport } = passportData;

    res.json({ stamp: stampData, passport: safePassport });
  } catch (error) {
    console.error('Error fetching stamp:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export proof bundle metadata
router.get('/:stampId/proof', async (req, res) => {
  try {
    const stamp = await prisma.stamp.findUnique({
      where: { id: req.params.stampId },
      include: {
        passport: {
          select: { id: true, username: true, displayName: true, publicKey: true },
        },
      },
    });

    if (!stamp) return res.status(404).json({ error: 'Stamp not found' });

    const proofBundle = {
      version: '1.0',
      stampId: stamp.id,
      creator: {
        passportId: stamp.passport.id,
        username: stamp.passport.username,
        displayName: stamp.passport.displayName,
      },
      file: {
        name: stamp.fileName,
        type: stamp.fileType,
        category: stamp.category,
        size: stamp.fileSize,
        sha256: stamp.originalHash,
      },
      protection: {
        signature: stamp.signature,
        publicKey: stamp.passport.publicKey,
        timestamp: stamp.createdAt.toISOString(),
        proofChain: stamp.proofChain ? JSON.parse(stamp.proofChain) : null,
        perceptualHashes: stamp.pHash ? { pHash: stamp.pHash, dHash: stamp.dHash } : null,
      },
      license: stamp.license,
      verification: {
        url: `${process.env.CLIENT_URL}/verify?id=${stamp.id}`,
        instructions: 'Upload the file to the verification URL or use the stamp ID to verify ownership.',
      },
      aiNotice: `This work is registered and protected. Use for AI/ML training without explicit permission from @${stamp.passport.username} is prohibited under ${stamp.license}.`,
    };

    res.json(proofBundle);
  } catch (error) {
    console.error('Error generating proof:', error);
    res.status(500).json({ error: 'Failed to generate proof bundle' });
  }
});

router.delete('/:stampId', authMiddleware, async (req, res) => {
  try {
    const stamp = await prisma.stamp.findUnique({
      where: { id: req.params.stampId },
      include: { passport: true },
    });

    if (!stamp) return res.status(404).json({ error: 'Stamp not found' });

    if (stamp.passport.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this stamp' });
    }

    await prisma.stamp.delete({ where: { id: req.params.stampId } });

    res.json({ success: true, message: 'Stamp deleted' });
  } catch (error) {
    console.error('Error deleting stamp:', error);
    res.status(500).json({ error: 'Failed to delete stamp' });
  }
});

module.exports = router;
