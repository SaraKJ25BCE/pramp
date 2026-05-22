const axios = require('axios');
const FormData = require('form-data');
const prisma = require('../config/prisma');
const { hammingDistance } = require('../utils/crypto');

/** Stricter than verify — block re-registration of same visual content */
const PHASH_DUPLICATE_THRESHOLD = 12;

function categorizeFile(mimetype, filename) {
  if (mimetype.startsWith('image/') && mimetype.includes('svg')) return 'other';
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.startsWith('video/')) return 'video';
  return 'other';
}

function isImageFile(mimetype, filename) {
  const cat = categorizeFile(mimetype, filename);
  return cat === 'image' && !mimetype.includes('svg');
}

function buildConflictResponse(stamp, matchType, matchDistance = null) {
  const username = stamp.passport?.username;
  return {
    error: username
      ? `This content is already registered on ProofStamp by @${username}`
      : 'This content is already registered on ProofStamp',
    existingStampId: stamp.id,
    registeredBy: username ? `@${username}` : null,
    registeredByName: stamp.passport?.displayName || null,
    registeredAt: stamp.createdAt,
    matchType,
    matchDistance,
    verifyUrl: `${process.env.CLIENT_URL}/verify?id=${stamp.id}`,
  };
}

async function computeImageHashes(file) {
  const formData = new FormData();
  formData.append('file', file.buffer, {
    filename: file.originalname,
    contentType: file.mimetype,
  });
  const response = await axios.post(
    `${process.env.STEGO_SERVICE_URL}/hash`,
    formData,
    { headers: formData.getHeaders(), timeout: 30000 }
  );
  return { pHash: response.data.pHash, dHash: response.data.dHash };
}

async function findPerceptualImageDuplicate(pHash, dHash) {
  const candidates = await prisma.stamp.findMany({
    where: { category: 'image', pHash: { not: null } },
    include: {
      passport: { select: { username: true, displayName: true } },
    },
  });

  let best = null;
  let bestDist = Infinity;

  for (const stamp of candidates) {
    const pDist = hammingDistance(pHash, stamp.pHash);
    const dDist = hammingDistance(dHash, stamp.dHash);
    const dist = Math.min(pDist, dDist);
    if (dist <= PHASH_DUPLICATE_THRESHOLD && dist < bestDist) {
      bestDist = dist;
      best = stamp;
    }
  }

  if (!best) return null;
  return buildConflictResponse(best, 'perceptual', bestDist);
}

async function findAudioFingerprintDuplicate(file) {
  try {
    const formData = new FormData();
    formData.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });
    const response = await axios.post(
      `${process.env.STEGO_SERVICE_URL}/fingerprint/audio`,
      formData,
      { headers: formData.getHeaders(), timeout: 30000 }
    );
    const fpJson = JSON.stringify(response.data);
    const existing = await prisma.stamp.findFirst({
      where: { audioFingerprint: fpJson },
      include: { passport: { select: { username: true, displayName: true } } },
    });
    if (existing) return buildConflictResponse(existing, 'audio_fingerprint');
  } catch (err) {
    console.warn('Audio duplicate check skipped:', err.message);
  }
  return null;
}

async function findVideoFingerprintDuplicate(file) {
  try {
    const formData = new FormData();
    formData.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });
    const response = await axios.post(
      `${process.env.STEGO_SERVICE_URL}/fingerprint/video`,
      formData,
      { headers: formData.getHeaders(), timeout: 30000 }
    );
    const fpJson = JSON.stringify(response.data);
    const existing = await prisma.stamp.findFirst({
      where: { videoFingerprint: fpJson },
      include: { passport: { select: { username: true, displayName: true } } },
    });
    if (existing) return buildConflictResponse(existing, 'video_fingerprint');
  } catch (err) {
    console.warn('Video duplicate check skipped:', err.message);
  }
  return null;
}

/**
 * Global duplicate check — any user who already registered this content blocks a new stamp.
 */
async function findGlobalDuplicate(file, serverHash) {
  const exact = await prisma.stamp.findFirst({
    where: {
      OR: [
        { originalHash: serverHash },
        { stampedHash: serverHash },
      ],
    },
    include: { passport: { select: { username: true, displayName: true } } },
  });
  if (exact) return buildConflictResponse(exact, 'exact');

  if (isImageFile(file.mimetype, file.originalname)) {
    try {
      const { pHash, dHash } = await computeImageHashes(file);
      const perceptual = await findPerceptualImageDuplicate(pHash, dHash);
      if (perceptual) return perceptual;
    } catch (err) {
      console.warn('Perceptual duplicate check failed:', err.message);
    }
  }

  const category = categorizeFile(file.mimetype, file.originalname);
  if (category === 'audio') {
    const audioDup = await findAudioFingerprintDuplicate(file);
    if (audioDup) return audioDup;
  }
  if (category === 'video') {
    const videoDup = await findVideoFingerprintDuplicate(file);
    if (videoDup) return videoDup;
  }

  return null;
}

module.exports = {
  findGlobalDuplicate,
  PHASH_DUPLICATE_THRESHOLD,
};
