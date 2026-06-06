const crypto = require('crypto');
const prisma = require('../config/prisma');
const { encryptPrivateKey } = require('../utils/crypto');

function generatePassportId() {
  const year = new Date().getFullYear();
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let random = '';
  for (let i = 0; i < 5; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `PP-${year}-${random}`;
}

async function createUserWithPassport({ email, displayName, googleId = null, avatarUrl = null }) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const passportId = generatePassportId();
  const encryptedPrivateKey = encryptPrivateKey(privateKey, {
    userId: 'pending',
    passportId,
  });

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase().trim(),
      googleId: googleId || undefined,
      emailVerified: true,
      avatarUrl: avatarUrl || undefined,
      passport: {
        create: {
          id: passportId,
          displayName,
          publicKey,
          privateKey: encryptedPrivateKey,
        },
      },
    },
    include: { passport: true },
  });

  const reEncrypted = encryptPrivateKey(privateKey, {
    userId: user.id,
    passportId: user.passport.id,
  });
  await prisma.passport.update({
    where: { id: user.passport.id },
    data: { privateKey: reEncrypted },
  });
  user.passport.privateKey = reEncrypted;

  return user;
}

module.exports = { createUserWithPassport, generatePassportId };
