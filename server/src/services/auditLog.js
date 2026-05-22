const crypto = require('crypto');
const prisma = require('../config/prisma');

const GENESIS = 'GENESIS';

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

function canonicalEntry(row) {
  return JSON.stringify({
    id: row.id,
    stampId: row.stampId,
    action: row.action,
    userId: row.userId,
    passportId: row.passportId,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    metadataJson: row.metadataJson,
    previousLogHash: row.previousLogHash,
    createdAt: row.createdAt.toISOString(),
  });
}

function hashEntry(row) {
  return crypto.createHash('sha256').update(canonicalEntry(row), 'utf8').digest('hex');
}

/**
 * @param {import('express').Request} [req]
 * @param {Object} params
 */
async function logAudit(req, params) {
  try {
    const { action, userId, passportId, stampId, metadata } = params;
    const meta = metadata || {};

    if (req) {
      meta.userAgent = req.headers['user-agent'] || null;
    }

    let previousLogHash = GENESIS;
    if (stampId) {
      const prev = await prisma.auditLog.findFirst({
        where: { stampId },
        orderBy: { createdAt: 'desc' },
        select: { entryHash: true },
      });
      if (prev?.entryHash) previousLogHash = prev.entryHash;
    }

    const createdAt = new Date();
    const id = crypto.randomUUID?.() || `audit_${Date.now()}`;

    const draft = {
      id,
      stampId: stampId || null,
      action,
      userId: userId || req?.user?.userId || null,
      passportId: passportId || null,
      ipAddress: req ? getClientIp(req) : null,
      userAgent: meta.userAgent || null,
      metadataJson: Object.keys(meta).length ? JSON.stringify(meta) : null,
      previousLogHash,
      createdAt,
    };

    const entryHash = hashEntry(draft);

    await prisma.auditLog.create({
      data: {
        id: draft.id,
        action: draft.action,
        userId: draft.userId,
        passportId: draft.passportId,
        stampId: draft.stampId,
        metadataJson: draft.metadataJson,
        ipAddress: draft.ipAddress,
        userAgent: draft.userAgent,
        previousLogHash: draft.previousLogHash,
        entryHash,
        createdAt: draft.createdAt,
      },
    });

    return { entryHash };
  } catch (err) {
    console.error('[AuditLog] Failed to write:', err.message);
    return null;
  }
}

async function getAuditChainForStamp(stampId) {
  return prisma.auditLog.findMany({
    where: { stampId },
    orderBy: { createdAt: 'asc' },
  });
}

function verifyAuditChain(entries) {
  if (!entries || entries.length === 0) {
    return { valid: true, entries: [], headHash: null, message: 'No audit entries' };
  }

  let expectedPrev = GENESIS;
  for (let i = 0; i < entries.length; i++) {
    const row = entries[i];
    if (row.previousLogHash !== expectedPrev) {
      return {
        valid: false,
        entries,
        headHash: entries[entries.length - 1]?.entryHash,
        brokenAt: row.id,
        message: `Chain break at entry ${row.id}: expected previous ${expectedPrev}`,
      };
    }
    const computed = hashEntry(row);
    if (computed !== row.entryHash) {
      return {
        valid: false,
        entries,
        headHash: entries[entries.length - 1]?.entryHash,
        brokenAt: row.id,
        message: `Hash mismatch at entry ${row.id}`,
      };
    }
    expectedPrev = row.entryHash;
  }

  return {
    valid: true,
    entries,
    headHash: entries[entries.length - 1].entryHash,
    message: 'Chain intact',
  };
}

async function exportAuditChain(stampId) {
  const entries = await getAuditChainForStamp(stampId);
  const verification = verifyAuditChain(entries);
  return {
    stampId,
    verification,
    entries: entries.map((e) => ({
      id: e.id,
      action: e.action,
      createdAt: e.createdAt,
      ipAddress: e.ipAddress,
      userAgent: e.userAgent,
      previousLogHash: e.previousLogHash,
      entryHash: e.entryHash,
      metadataJson: e.metadataJson ? JSON.parse(e.metadataJson) : null,
    })),
  };
}

function buildAuditChainVerificationText(exportData) {
  const { verification, entries, stampId } = exportData;
  return `AUDIT CHAIN VERIFICATION — ${stampId}
Status: ${verification.valid ? 'VALID' : 'INVALID'}
Head hash: ${verification.headHash || 'n/a'}
Entries: ${entries.length}

To verify: recompute SHA-256 of each canonical entry (see audit-chain.json schema) and confirm
previousLogHash links (first entry uses GENESIS).

${verification.message}
`;
}

module.exports = {
  logAudit,
  getClientIp,
  getAuditChainForStamp,
  verifyAuditChain,
  exportAuditChain,
  buildAuditChainVerificationText,
  hashEntry,
  GENESIS,
};
