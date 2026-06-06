const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const QRCode = require('qrcode');
const authOrApiKey = require('../middleware/authOrApiKey');
const upload = require('../middleware/upload');
const { validateUploadedMagic } = require('../middleware/upload');
const { sanitizePassport } = require('../utils/sanitizePassport');
const { isCloudinaryUrl } = require('../utils/cdn');
const { notifyWebhook } = require('../services/webhooks');
const prisma = require('../config/prisma');
const { uploadBuffer, getThumbnailUrl } = require('../config/cloudinary');
const { decryptPrivateKey, computeHash, signData } = require('../utils/crypto');
const { enforceStampQuota, stampCreatePerUserLimiter } = require('../middleware/rateLimiter');
const { findGlobalDuplicate } = require('../services/duplicateCheck');
const { getTimestampToken, verifyTimestampTokenFull } = require('../services/timestamping');
const {
  requiresTsaOnStamp,
  isLegalProofEnabled,
  SYSTEM_ATTESTATION,
  resolveTsaTier,
  assertTsaAllowedForStamp,
  TSA_PROVIDER_NAME,
  MARKETING,
  getTsaDisplayMeta,
} = require('../config/legalProof');
const { generateSystem63Pdf, saveEvidencePdf } = require('../services/legalEvidence');
const { logAudit, exportAuditChain } = require('../services/auditLog');
const { buildVerifyInstructions } = require('../utils/verifyInstructions');
const { formatAnchorsForProof } = require('../services/blockchainProof');
const { verifyAttestation } = require('../services/creatorAttestation');
const { hasCreatorAttestation } = require('../config/legalProof');

const router = express.Router();

function getBaseUrl() {
  return process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3001}`;
}

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

function buildProofChain(stampId, hash, timestamp, prevBlockHash) {
  const block = { stampId, hash, timestamp, prevHash: prevBlockHash || '0'.repeat(64) };
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

  y -= 10;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  y -= 20;
  page.drawText('LEGAL TIMESTAMP & EVIDENCE', { x: 50, y, size: 11, font: fontBold, color: rgb(0.1, 0.1, 0.5) });
  y -= 18;
  page.drawText(`Registered: ${new Date(stamp.createdAt).toISOString()}`, { x: 50, y, size: 9, font });
  y -= 14;
  if (stamp.tsaTimestamp) {
    page.drawText(`RFC 3161 TSA: ${new Date(stamp.tsaTimestamp).toISOString()} (${stamp.tsaVerifyStatus || 'pending'})`, { x: 50, y, size: 9, font });
    y -= 14;
  }
  if (stamp.evidenceCertificateUrl) {
    page.drawText('BSA 2023 Section 63 system certificate issued — see counsel evidence packet.', { x: 50, y, size: 9, font });
    y -= 14;
  }
  page.drawText(`${MARKETING.counselPacketName}: ${getBaseUrl()}/legal/${stamp.id}/litigation-pack`, { x: 50, y, size: 8, font });
  y -= 14;
  page.drawText('Verify SHA-256 hash and RSA signature against creator public key.', { x: 50, y, size: 9, font });
  y -= 14;

  page.drawImage(qrImage, { x: 400, y: y - 80, width: 130, height: 130 });
  page.drawText('Scan to verify', { x: 425, y: y - 95, size: 9, font, color: rgb(0.4, 0.4, 0.4) });

  y -= 120;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  y -= 18;
  page.drawText('AI TRAINING NOTICE', { x: 50, y, size: 10, font: fontBold, color: rgb(0.7, 0.1, 0.1) });
  y -= 16;
  page.drawText(`This work is protected under ${stamp.license}. Use of this content for AI/ML`, { x: 50, y, size: 9, font });
  y -= 14;
  page.drawText('training without explicit written permission from the creator is prohibited.', { x: 50, y, size: 9, font });

  page.drawText('Generated by ProofStamp — cryptographic proof of creative ownership.', {
    x: 50, y: 40, size: 8, font, color: rgb(0.5, 0.5, 0.5),
  });

  return Buffer.from(await pdfDoc.save());
}

async function processStego(file, stampId) {
  const formData = new FormData();
  formData.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype });
  formData.append('stamp_id', stampId);
  const response = await axios.post(`${process.env.STEGO_SERVICE_URL}/stamp`, formData, {
    headers: formData.getHeaders(), timeout: 30000,
  });
  return response.data;
}

async function processAudioFingerprint(file) {
  try {
    const formData = new FormData();
    formData.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype });
    const response = await axios.post(`${process.env.STEGO_SERVICE_URL}/fingerprint/audio`, formData, {
      headers: formData.getHeaders(), timeout: 30000,
    });
    return response.data;
  } catch (err) {
    console.error('Audio fingerprinting failed:', err.message);
    return null;
  }
}

async function processVideoFingerprint(file) {
  try {
    const formData = new FormData();
    formData.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype });
    const response = await axios.post(`${process.env.STEGO_SERVICE_URL}/fingerprint/video`, formData, {
      headers: formData.getHeaders(), timeout: 60000,
    });
    return response.data;
  } catch (err) {
    console.error('Video fingerprinting failed:', err.message);
    return null;
  }
}

async function runBackgroundTasks(stampId, file, stampedBuffer, passportRecord, isImage, category, user = null) {
  const fs = require('fs');
  const path = require('path');
  const uploadsDir = path.join(__dirname, '../../uploads');
  const baseUrl = getBaseUrl();

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

    await prisma.stamp.update({
      where: { id: stampId },
      data: { ...cdnUpdate, processing: false },
    });

    const updatedStamp = await prisma.stamp.findUnique({ where: { id: stampId } });
    const certBuffer = await generateCertificatePdf(updatedStamp, passportRecord);
    const certDir = path.join(uploadsDir, 'certificates');
    if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });
    const certLocalPath = path.join(certDir, `${stampId}.pdf`);
    fs.writeFileSync(certLocalPath, certBuffer);
    await prisma.stamp.update({
      where: { id: stampId },
      data: { certificateUrl: `${baseUrl}/uploads/certificates/${stampId}.pdf` },
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

    // C2PA manifest embedding (for images)
    if (isImage && updatedStamp.c2paEnabled !== false) {
      try {
        const c2paFormData = new FormData();
        c2paFormData.append('file', stampedBuffer || file.buffer, {
          filename: 'image.png',
          contentType: 'image/png',
        });
        c2paFormData.append('stamp_id', stampId);
        c2paFormData.append('creator_name', passportRecord.displayName);
        c2paFormData.append('creator_handle', `@${passportRecord.username}`);
        c2paFormData.append('title', updatedStamp.title || '');
        c2paFormData.append('license_name', updatedStamp.license || 'All Rights Reserved');
        c2paFormData.append('do_not_train', String(updatedStamp.aiOptOut !== false));

        const c2paResp = await axios.post(
          `${process.env.STEGO_SERVICE_URL}/c2pa`,
          c2paFormData,
          { headers: c2paFormData.getHeaders(), timeout: 30000 }
        );

        if (c2paResp.data?.c2pa_image_base64) {
          const c2paBuffer = Buffer.from(c2paResp.data.c2pa_image_base64, 'base64');
          const c2paCdn = await uploadBuffer(c2paBuffer, {
            folder: 'proofstamp/c2pa',
            public_id: stampId + '-c2pa',
          });
          await prisma.stamp.update({
            where: { id: stampId },
            data: { c2paManifestUrl: c2paCdn.secure_url },
          });
        }
      } catch (c2paErr) {
        console.warn(`C2PA manifest failed for ${stampId} (non-fatal):`, c2paErr.message);
      }
    }

    const originalExt = updatedStamp.fileType || 'bin';
    try { fs.unlinkSync(path.join(uploadsDir, 'originals', `${stampId}.${originalExt}`)); } catch (e) {}
    if (stampedBuffer) {
      try { fs.unlinkSync(path.join(uploadsDir, 'stamped', `${stampId}.png`)); } catch (e) {}
    }
    try { fs.unlinkSync(certLocalPath); } catch (e) {}

    if (isLegalProofEnabled()) {
      let stampForLegal = await prisma.stamp.findUnique({ where: { id: stampId } });
      if (!stampForLegal) return;

      if (stampForLegal.tsaToken) {
        const tokenBuf = Buffer.isBuffer(stampForLegal.tsaToken)
          ? stampForLegal.tsaToken
          : Buffer.from(stampForLegal.tsaToken);
        const verify = verifyTimestampTokenFull(tokenBuf, stampForLegal.originalHash);
        await prisma.stamp.update({
          where: { id: stampId },
          data: { tsaVerifyStatus: verify.valid ? 'valid' : 'invalid' },
        });
        stampForLegal = await prisma.stamp.findUnique({ where: { id: stampId } });
      }

      const s63Buffer = await generateSystem63Pdf(stampForLegal, passportRecord, user);
      const evidenceUrl = await saveEvidencePdf(s63Buffer, stampId, 'evidence', 'bsa-section63-system');
      await prisma.stamp.update({
        where: { id: stampId },
        data: { evidenceCertificateUrl: evidenceUrl },
      });

      await logAudit(null, {
        action: 'SECTION_63_ISSUED',
        stampId,
        passportId: passportRecord.id,
        userId: user?.id,
      });
    }
  } catch (err) {
    console.error(`Background tasks failed for ${stampId}:`, err.message);
    try {
      await prisma.stamp.update({
        where: { id: stampId },
        data: { processing: false },
      });
    } catch (_) {}
  }
}

async function stampFile(file, passportRecord, privateKey, title, description, license, lastStamp) {
  const category = categorizeFile(file.mimetype, file.originalname);
  const fileType = getFileExtension(file.mimetype, file.originalname);
  const isImage = category === 'image' && !file.mimetype.includes('svg');
  const isAudio = category === 'audio';
  const isVideo = category === 'video';
  const serverHash = computeHash(file.buffer);
  let stampId = generateStampId();

  const fs = require('fs');
  const path = require('path');
  const uploadsDir = path.join(__dirname, '../../uploads');
  const originalExt = fileType || 'bin';

  const originalsDir = path.join(uploadsDir, 'originals');
  if (!fs.existsSync(originalsDir)) fs.mkdirSync(originalsDir, { recursive: true });
  const originalLocalPath = path.join(originalsDir, `${stampId}.${originalExt}`);
  fs.writeFileSync(originalLocalPath, file.buffer);

  const baseUrl = getBaseUrl();
  const originalFileUrl = `${baseUrl}/uploads/originals/${stampId}.${originalExt}`;
  let thumbnailUrl = isImage ? originalFileUrl : null;

  let pHash = null, dHash = null, embedding = null, stampedBuffer = null, stampedHash = null;
  let stampedFileUrl = null;
  let audioFingerprint = null, videoFingerprint = null;

  if (isImage) {
    try {
      const stegoData = await processStego(file, stampId);
      pHash = stegoData.pHash;
      dHash = stegoData.dHash;
      embedding = stegoData.embedding;

      if (stegoData.stamped_base64) {
        stampedBuffer = Buffer.from(stegoData.stamped_base64, 'base64');
        stampedHash = computeHash(stampedBuffer);

        const stampedDir = path.join(uploadsDir, 'stamped');
        if (!fs.existsSync(stampedDir)) fs.mkdirSync(stampedDir, { recursive: true });
        const stampedLocalPath = path.join(stampedDir, `${stampId}.png`);
        fs.writeFileSync(stampedLocalPath, stampedBuffer);
        stampedFileUrl = `${baseUrl}/uploads/stamped/${stampId}.png`;
        thumbnailUrl = stampedFileUrl;
      }
    } catch (err) {
      console.error(`Stego failed for ${stampId}:`, err.message);
    }
  } else if (isAudio) {
    const result = await processAudioFingerprint(file);
    if (result) audioFingerprint = JSON.stringify(result);
  } else if (isVideo) {
    const result = await processVideoFingerprint(file);
    if (result) videoFingerprint = JSON.stringify(result);
  }

  const timestamp = new Date().toISOString();
  const signPayload = `${stampId}|${passportRecord.id}|${serverHash}|${timestamp}`;
  const signature = signData(signPayload, privateKey);

  let prevBlockHash = null;
  if (lastStamp?.proofChain) {
    try {
      const prevChain = JSON.parse(lastStamp.proofChain);
      prevBlockHash = prevChain.blockHash;
    } catch (e) {}
  }

  const proofChain = JSON.stringify(
    buildProofChain(stampId, serverHash, timestamp, prevBlockHash)
  );

  const protections = ['sha256-fingerprint', 'rsa-signature', 'timestamp-proof'];
  if (isImage) protections.push('perceptual-hash', 'dwt-dct-watermark');
  if (isAudio && audioFingerprint) protections.push('audio-fingerprint');
  if (isVideo && videoFingerprint) protections.push('video-fingerprint');

  const tsaTier = resolveTsaTier();
  let tsaFields = { tsaTier, tsaProviderName: TSA_PROVIDER_NAME };
  let tsaPending = false;

  if (requiresTsaOnStamp()) {
    const allowed = assertTsaAllowedForStamp();
    if (!allowed.ok) {
      throw new Error(allowed.error);
    }
    try {
      const tsa = await getTimestampToken(serverHash);
      protections.push('rfc3161-trusted-timestamp');
      if (isLegalProofEnabled()) protections.push('bsa-section63-system-certificate');
      tsaFields = {
        ...tsaFields,
        tsaToken: tsa.tsToken,
        tsaUrl: tsa.tsaUrl,
        tsaTimestamp: tsa.timestamp,
        tsaVerifyStatus: tsa.signatureVerified === false ? 'invalid' : 'valid',
        tsaStatus: 'confirmed',
        tsaProviderName: tsa.tsaProviderName || TSA_PROVIDER_NAME,
        tsaChainJson: tsa.signerInfo ? JSON.stringify(tsa.signerInfo) : null,
      };
    } catch (tsaErr) {
      console.error(`TSA failed for ${stampId}, queuing retry:`, tsaErr.message);
      tsaPending = true;
      tsaFields.tsaStatus = 'pending';
      protections.push('tsa-pending-retry');
    }
  }

  const metadata = {
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.buffer.length,
    category,
    stampedAt: timestamp,
    signPayload,
    protections,
    tsaPending,
    tsaDisplay: getTsaDisplayMeta(),
  };

  const MAX_ID_RETRIES = 8;
  let stamp;

  for (let attempt = 0; attempt < MAX_ID_RETRIES; attempt++) {
    if (attempt > 0) {
      stampId = generateStampId();
    }
    try {
      stamp = await prisma.stamp.create({
        data: {
          id: stampId,
          passportId: passportRecord.id,
          originalHash: serverHash,
          stampedHash,
          pHash,
          dHash,
          embedding,
          audioFingerprint,
          videoFingerprint,
          title,
          description: description || null,
          license: license || 'All Rights Reserved',
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
          processing: true,
          ...tsaFields,
        },
      });
      break;
    } catch (err) {
      if (err.code === 'P2002' && attempt < MAX_ID_RETRIES - 1) continue;
      throw err;
    }
  }

  return { stamp, stampedBuffer, isImage, category, serverHash };
}

router.post('/', authOrApiKey, stampCreatePerUserLimiter, enforceStampQuota, upload.single('file'), validateUploadedMagic, async (req, res) => {
  try {
    const { title, description, license, clientHash } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file provided' });
    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (!license) return res.status(400).json({ error: 'License is required' });

    const serverHash = computeHash(file.buffer);
    if (clientHash && clientHash !== serverHash) {
      return res.status(400).json({ error: 'File integrity check failed — hash mismatch' });
    }

    const [duplicate, passportRecord] = await Promise.all([
      findGlobalDuplicate(file, serverHash),
      prisma.passport.findUnique({ where: { userId: req.user.userId } }),
    ]);

    if (duplicate) {
      return res.status(409).json(duplicate);
    }

    const privateKey = decryptPrivateKey(passportRecord.privateKey, {
      userId: req.user.userId,
      passportId: passportRecord.id,
    });

    const lastStamp = await prisma.stamp.findFirst({
      where: { passportId: passportRecord.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, proofChain: true },
    });

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, email: true, plan: true },
    });

    let stampResult;
    try {
      stampResult = await stampFile(
        file, passportRecord, privateKey, title, description, license, lastStamp
      );
    } catch (err) {
      if (err.message?.includes('TSA') || err.message?.includes('imprint') || err.message?.includes('Production mode')) {
        return res.status(503).json({
          error: 'LEGAL_TSA_FAILED',
          message: err.message,
          detail: err.message,
        });
      }
      throw err;
    }

    const { stamp, stampedBuffer, isImage, category } = stampResult;

    await logAudit(req, {
      action: 'STAMP_CREATED',
      stampId: stamp.id,
      passportId: passportRecord.id,
      metadata: { title, category },
    });

    const baseUrl = getBaseUrl();
    const usage =
      typeof req.stampsRemaining === 'number'
        ? {
            stampsRemaining: req.stampsRemaining,
            monthlyLimit: require('../config/fairUse').resolveFairUseMonthly(),
          }
        : null;

    res.status(201).json({
      stamp: {
        ...stamp,
        processing: true,
        cdnReady: isCloudinaryUrl(stamp.originalFileUrl),
      },
      verifyUrl: `${process.env.CLIENT_URL}/verify?id=${stamp.id}`,
      usage,
      legalProof: {
        artifactsUrl: `${baseUrl}/legal/${stamp.id}/artifacts`,
        counselPacketUrl: `${baseUrl}/legal/${stamp.id}/litigation-pack`,
        litigationPackUrl: `${baseUrl}/legal/${stamp.id}/litigation-pack`,
        systemCertificateUrl: `${baseUrl}/legal/${stamp.id}/system-certificate`,
        attestUrl: `${baseUrl}/legal/${stamp.id}/attest`,
        tsaVerifyUrl: `${baseUrl}/tsa/verify/${stamp.id}`,
        tsa: getTsaDisplayMeta(),
        requiresCreatorAttestation: true,
      },
    });

    setImmediate(() => {
      notifyWebhook(passportRecord.id, 'stamp.created', {
        stampId: stamp.id,
        title: stamp.title,
        category: stamp.category,
      });
    });

    runBackgroundTasks(stamp.id, file, stampedBuffer, passportRecord, isImage, category, user);
  } catch (error) {
    console.error('Error creating stamp:', error);
    res.status(500).json({ error: 'Failed to create stamp' });
  }
});

router.post('/bulk', authOrApiKey, stampCreatePerUserLimiter, enforceStampQuota, upload.array('files', 20), validateUploadedMagic, async (req, res) => {
  try {
    const { license, titles } = req.body;
    const files = req.files;

    if (!files || files.length === 0) return res.status(400).json({ error: 'No files provided' });

    const parsedTitles = titles ? JSON.parse(titles) : [];
    const passportRecord = await prisma.passport.findUnique({
      where: { userId: req.user.userId },
    });
    const privateKey = decryptPrivateKey(passportRecord.privateKey, {
      userId: req.user.userId,
      passportId: passportRecord.id,
    });

    let lastStamp = await prisma.stamp.findFirst({
      where: { passportId: passportRecord.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, proofChain: true },
    });

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, email: true, plan: true },
    });

    const results = [];
    const backgroundJobs = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const title = parsedTitles[i] || file.originalname;
      const serverHash = computeHash(file.buffer);

      const duplicate = await findGlobalDuplicate(file, serverHash);
      if (duplicate) {
        results.push({
          stampId: null, title,
          category: categorizeFile(file.mimetype, file.originalname),
          fileType: getFileExtension(file.mimetype, file.originalname),
          skipped: true,
          reason: 'duplicate',
          existingStampId: duplicate.existingStampId,
          registeredBy: duplicate.registeredBy,
          matchType: duplicate.matchType,
        });
        continue;
      }

      try {
        const { stamp, stampedBuffer, isImage, category } = await stampFile(
          file, passportRecord, privateKey, title, null, license, lastStamp
        );

        lastStamp = { id: stamp.id, proofChain: stamp.proofChain };
        results.push({ stampId: stamp.id, title, category: stamp.category, fileType: stamp.fileType });
        backgroundJobs.push(() =>
          runBackgroundTasks(stamp.id, file, stampedBuffer, passportRecord, isImage, category, user)
        );
      } catch (err) {
        results.push({
          stampId: null,
          title,
          skipped: true,
          reason: err.message?.includes('TSA') || err.message?.includes('imprint') ? 'tsa_failed' : 'error',
          error: err.message,
        });
      }
    }

    res.status(201).json({ stamps: results, count: results.filter(r => !r.skipped).length });

    for (const job of backgroundJobs) {
      job();
    }
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

    res.json({
      stamp: {
        ...stampData,
        cdnReady: isCloudinaryUrl(stampData.originalFileUrl) && !stampData.processing,
      },
      passport: sanitizePassport(passportData),
    });
  } catch (error) {
    console.error('Error fetching stamp:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:stampId/proof', async (req, res) => {
  try {
    const stamp = await prisma.stamp.findUnique({
      where: { id: req.params.stampId },
      include: {
        passport: {
          select: { id: true, username: true, displayName: true, publicKey: true },
        },
        stampAnchors: {
          include: { anchor: true },
        },
      },
    });

    if (!stamp) return res.status(404).json({ error: 'Stamp not found' });

    const baseUrl = getBaseUrl();
    const auditExport = await exportAuditChain(stamp.id);

    await logAudit(req, {
      action: 'PROOF_BUNDLE_VIEWED',
      stampId: stamp.id,
      passportId: stamp.passportId,
    });

    let creatorAttestation = null;
    if (stamp.creatorAttestationSignature && stamp.creatorAttestationPayload) {
      creatorAttestation = {
        name: stamp.creatorAttestationName,
        at: stamp.creatorAttestationAt?.toISOString(),
        payload: stamp.creatorAttestationPayload,
        signature: stamp.creatorAttestationSignature,
        algorithm: 'RSA-SHA256',
        verified: verifyAttestation(
          stamp.passport.publicKey,
          stamp.creatorAttestationPayload,
          stamp.creatorAttestationSignature
        ),
        declarationUrl: stamp.creatorDeclarationUrl,
      };
    } else if (stamp.creatorAttestationAt) {
      creatorAttestation = { legacy: true, reattestRequired: true };
    }

    const proofBundle = {
      version: '3.0',
      stampId: stamp.id,
      creator: {
        passportId: stamp.passport.id,
        username: stamp.passport.username,
        displayName: stamp.passport.displayName,
        attestation: creatorAttestation,
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
        audioFingerprint: stamp.audioFingerprint ? JSON.parse(stamp.audioFingerprint) : null,
        videoFingerprint: stamp.videoFingerprint ? JSON.parse(stamp.videoFingerprint) : null,
      },
      trustedTimestamp: stamp.tsaToken ? {
        tsaUrl: stamp.tsaUrl,
        tsaTier: stamp.tsaTier,
        tsaProvider: stamp.tsaProviderName,
        timestamp: stamp.tsaTimestamp?.toISOString() || null,
        verifyStatus: stamp.tsaVerifyStatus,
        tsaChain: stamp.tsaChainJson ? JSON.parse(stamp.tsaChainJson) : null,
        token: Buffer.isBuffer(stamp.tsaToken) ? stamp.tsaToken.toString('base64') : stamp.tsaToken,
        verifyUrl: `${baseUrl}/tsa/verify/${stamp.id}`,
        tokenDownloadUrl: `${baseUrl}/tsa/token/${stamp.id}`,
        display: getTsaDisplayMeta(),
      } : null,
      keyCustody: {
        algorithm: 'RSA-2048',
        publicKeyOnRecord: true,
        privateKeyStorage: 'aes-256-gcm-encrypted-at-rest',
        exportableByCreator: true,
        exportEndpoint: `${baseUrl}/passport/me/export-private-key`,
      },
      systemAttestation: SYSTEM_ATTESTATION,
      legalArtifacts: {
        section63SystemCertificateUrl: stamp.evidenceCertificateUrl,
        creatorDeclarationUrl: stamp.creatorDeclarationUrl,
        counselPacketUrl: `${baseUrl}/legal/${stamp.id}/litigation-pack`,
        attestUrl: `${baseUrl}/legal/${stamp.id}/attest`,
        artifactsCatalogUrl: `${baseUrl}/legal/${stamp.id}/artifacts`,
        requiresCreatorAttestation: !hasCreatorAttestation(stamp),
      },
      blockchainAnchors: formatAnchorsForProof(stamp.stampAnchors),
      auditChainHeadHash: auditExport.verification.headHash,
      auditChainValid: auditExport.verification.valid,
      verifyInstructions: buildVerifyInstructions(baseUrl, stamp.id),
      license: stamp.license,
      verification: {
        url: `${process.env.CLIENT_URL}/verify?id=${stamp.id}`,
      },
      aiNotice: `This work is registered and protected. Use for AI/ML training without explicit permission from @${stamp.passport.username} is prohibited under ${stamp.license}.`,
    };

    res.json(proofBundle);
  } catch (error) {
    console.error('Error generating proof:', error);
    res.status(500).json({ error: 'Failed to generate proof bundle' });
  }
});

router.delete('/:stampId', authOrApiKey, async (req, res) => {
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
