const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const crypto = require('crypto');
const prisma = require('./prisma');
const { withDbRetry } = require('./prisma');
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

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await withDbRetry(async () => {
          let existing = await prisma.user.findUnique({
            where: { googleId: profile.id },
            include: { passport: true },
          });

          if (existing) return existing;

          const email = profile.emails[0].value.toLowerCase();
          const byEmail = await prisma.user.findUnique({
            where: { email },
            include: { passport: true },
          });

          if (byEmail) {
            return prisma.user.update({
              where: { id: byEmail.id },
              data: {
                googleId: profile.id,
                emailVerified: true,
                avatarUrl: profile.photos?.[0]?.value || byEmail.avatarUrl,
              },
              include: { passport: true },
            });
          }

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

          const created = await prisma.user.create({
            data: {
              googleId: profile.id,
              email,
              emailVerified: true,
              avatarUrl: profile.photos?.[0]?.value || null,
              passport: {
                create: {
                  id: passportId,
                  displayName: profile.displayName,
                  publicKey,
                  privateKey: encryptedPrivateKey,
                },
              },
            },
            include: { passport: true },
          });

          const reEncrypted = encryptPrivateKey(privateKey, {
            userId: created.id,
            passportId: created.passport.id,
          });
          await prisma.passport.update({
            where: { id: created.passport.id },
            data: { privateKey: reEncrypted },
          });
          created.passport.privateKey = reEncrypted;
          return created;
        });

        done(null, user);
      } catch (error) {
        console.error('Google OAuth DB error:', error.message);
        done(error, null);
      }
    }
  )
);
