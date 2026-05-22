const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { signData, verifySignature } = require('../utils/crypto');

const KEY_DIR = path.join(__dirname, '../../certs/platform');

function ensureKeyDir() {
  if (!fs.existsSync(KEY_DIR)) fs.mkdirSync(KEY_DIR, { recursive: true });
}

function loadOrCreatePlatformKeys() {
  const pubEnv = process.env.PLATFORM_PUBLIC_KEY_PEM;
  const privEnv = process.env.PLATFORM_PRIVATE_KEY_PEM;

  if (pubEnv && privEnv) {
    return { publicKeyPem: pubEnv.replace(/\\n/g, '\n'), privateKeyPem: privEnv.replace(/\\n/g, '\n') };
  }

  ensureKeyDir();
  const pubPath = path.join(KEY_DIR, 'platform-public.pem');
  const privPath = path.join(KEY_DIR, 'platform-private.pem');

  if (fs.existsSync(pubPath) && fs.existsSync(privPath)) {
    return {
      publicKeyPem: fs.readFileSync(pubPath, 'utf8'),
      privateKeyPem: fs.readFileSync(privPath, 'utf8'),
    };
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  fs.writeFileSync(pubPath, publicKey, { mode: 0o644 });
  fs.writeFileSync(privPath, privateKey, { mode: 0o600 });
  console.warn('[PlatformSigning] Generated new platform RSA keypair at server/certs/platform/ — set PLATFORM_*_KEY_PEM in production.');

  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

function publicKeyFingerprint(publicKeyPem) {
  const der = crypto.createHash('sha256').update(publicKeyPem, 'utf8').digest('hex');
  return der.slice(0, 32);
}

/**
 * Canonical system certificate payload for platform RSA signature.
 */
function buildSystemCertificatePayload(stamp, passport, user, auditHeadHash) {
  return [
    'SYSCERT',
    'v1',
    stamp.id,
    stamp.originalHash,
    stamp.createdAt instanceof Date ? stamp.createdAt.toISOString() : String(stamp.createdAt),
    stamp.tsaTimestamp instanceof Date ? stamp.tsaTimestamp.toISOString() : stamp.tsaTimestamp || '',
    stamp.tsaUrl || '',
    stamp.tsaVerifyStatus || '',
    auditHeadHash || '',
    passport.id,
    user?.email || '',
  ].join('|');
}

function signSystemCertificate(payload) {
  const { privateKeyPem } = loadOrCreatePlatformKeys();
  return signData(payload, privateKeyPem);
}

function verifySystemCertificate(payload, signature) {
  const { publicKeyPem } = loadOrCreatePlatformKeys();
  return verifySignature(payload, signature, publicKeyPem);
}

function getPlatformPublicKeyPem() {
  return loadOrCreatePlatformKeys().publicKeyPem;
}

function getPlatformVerifyMeta() {
  const publicKeyPem = getPlatformPublicKeyPem();
  const base = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3001}`;
  return {
    algorithm: 'RSA-SHA256',
    publicKeyFingerprint: publicKeyFingerprint(publicKeyPem),
    verifyUrl: `${base}/.well-known/platform-public-key.pem`,
  };
}

module.exports = {
  buildSystemCertificatePayload,
  signSystemCertificate,
  verifySystemCertificate,
  getPlatformPublicKeyPem,
  getPlatformVerifyMeta,
  publicKeyFingerprint,
};
