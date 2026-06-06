const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function userFromPassport(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // If using API key, authOrApiKey already populated req.user.passportId
    let passportId = req.user.passportId;

    if (!passportId) {
      // Find the user's default passport if not explicitly provided
      // Usually req.user from JWT has `userId`
      const userId = req.user.userId || req.user.id;
      
      if (!userId) {
        return res.status(401).json({ error: 'User ID missing from token' });
      }

      const passport = await prisma.passport.findUnique({
        where: { userId }
      });

      if (!passport) {
        return res.status(403).json({ error: 'No passport found for user' });
      }
      
      req.passport = passport;
    } else {
      const passport = await prisma.passport.findUnique({
        where: { id: passportId }
      });
      
      if (!passport) {
        return res.status(403).json({ error: 'Passport not found' });
      }
      
      req.passport = passport;
    }

    next();
  } catch (error) {
    console.error('userFromPassport error:', error);
    res.status(500).json({ error: 'Internal server error resolving passport' });
  }
}

module.exports = { userFromPassport };
