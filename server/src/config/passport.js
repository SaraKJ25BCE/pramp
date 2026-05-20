const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

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
        let user = await prisma.user.findUnique({
          where: { googleId: profile.id },
          include: { passport: true },
        });

        if (!user) {
          const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
          });

          user = await prisma.user.create({
            data: {
              googleId: profile.id,
              email: profile.emails[0].value,
              avatarUrl: profile.photos?.[0]?.value || null,
              passport: {
                create: {
                  id: generatePassportId(),
                  displayName: profile.displayName,
                  publicKey,
                  privateKey,
                },
              },
            },
            include: { passport: true },
          });
        }

        done(null, user);
      } catch (error) {
        done(error, null);
      }
    }
  )
);
