const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getServerSecret() {
  const key = process.env.KEY_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('KEY_ENCRYPTION_KEY environment variable is required');
  }
  return Buffer.from(key, 'hex');
}

function deriveUserKey(userId, passportId, salt) {
  const material = `${process.env.KEY_ENCRYPTION_KEY}:${userId || ''}:${passportId || ''}`;
  return crypto.scryptSync(material, salt, 32);
}

/**
 * Tier-1 envelope encryption: per-user salt + userId + passportId in KDF input.
 */
function encryptPrivateKey(plaintext, context = {}) {
  const { userId, passportId } = context;
  if (userId && passportId) {
    const salt = crypto.randomBytes(16);
    const key = deriveUserKey(userId, passportId, salt);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();
    return `enc2:${salt.toString('base64')}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  }

  const key = getServerSecret();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();
  return `enc:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

function decryptPrivateKey(stored, context = {}) {
  if (stored.startsWith('-----BEGIN')) {
    return stored;
  }

  if (stored.startsWith('enc2:')) {
    const parts = stored.split(':');
    if (parts.length !== 5) throw new Error('Invalid enc2 key format');
    const salt = Buffer.from(parts[1], 'base64');
    const iv = Buffer.from(parts[2], 'base64');
    const authTag = Buffer.from(parts[3], 'base64');
    const encrypted = parts[4];
    const key = deriveUserKey(context.userId, context.passportId, salt);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  if (!stored.startsWith('enc:')) {
    return stored;
  }

  const parts = stored.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted key format');
  }

  const key = getServerSecret();
  const iv = Buffer.from(parts[1], 'base64');
  const authTag = Buffer.from(parts[2], 'base64');
  const encrypted = parts[3];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

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

function signData(data, privateKeyPem) {
  const sign = crypto.createSign('SHA256');
  sign.update(data);
  return sign.sign(privateKeyPem, 'base64');
}

function verifySignature(data, signature, publicKeyPem) {
  try {
    const verify = crypto.createVerify('SHA256');
    verify.update(data);
    return verify.verify(publicKeyPem, signature, 'base64');
  } catch {
    return false;
  }
}

module.exports = {
  encryptPrivateKey,
  decryptPrivateKey,
  computeHash,
  hammingDistance,
  signData,
  verifySignature,
};
