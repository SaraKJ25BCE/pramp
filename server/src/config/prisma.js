const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function connectDatabase(maxRetries = 5) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      console.log('Database connected');
      return;
    } catch (err) {
      console.error(`Database connect attempt ${attempt}/${maxRetries}:`, err.message);
      if (attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

async function withDbRetry(fn, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err.message || '';
      const retryable =
        msg.includes("Can't reach database server") ||
        msg.includes('Connection timed out') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('Connection reset');
      if (!retryable || attempt === maxRetries) throw err;
      console.warn(`DB retry ${attempt}/${maxRetries}:`, msg.split('\n')[0]);
      try {
        await prisma.$disconnect();
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      await prisma.$connect();
    }
  }
  throw lastError;
}

module.exports = prisma;
module.exports.connectDatabase = connectDatabase;
module.exports.withDbRetry = withDbRetry;
