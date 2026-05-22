const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const prisma = require('../config/prisma');
const { exportAuditChain } = require('../services/auditLog');

const LOG_DIR = path.join(__dirname, '../../uploads/audit-anchors');

function appendLocalAnchorLog(lines) {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  const file = path.join(LOG_DIR, `audit-heads-${new Date().toISOString().slice(0, 10)}.log`);
  fs.appendFileSync(file, `${lines.join('\n')}\n`, 'utf8');
}

async function pushToGithub(content) {
  const token = process.env.GITHUB_AUDIT_TOKEN;
  const repo = process.env.GITHUB_AUDIT_REPO;
  if (!token || !repo) return false;

  const [owner, name] = repo.split('/');
  if (!owner || !name) return false;

  const filePath = `audit-heads/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const apiUrl = `https://api.github.com/repos/${owner}/${name}/contents/${filePath}`;

  const res = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `audit head anchor ${new Date().toISOString()}`,
      content: Buffer.from(content, 'utf8').toString('base64'),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.warn('[AuditHeadGithub] GitHub API failed:', res.status, text.slice(0, 200));
    return false;
  }
  return true;
}

async function exportActiveStampHeads() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const stamps = await prisma.stamp.findMany({
    where: { createdAt: { gte: since } },
    select: { id: true },
    take: 500,
    orderBy: { createdAt: 'desc' },
  });

  const heads = [];
  for (const { id } of stamps) {
    const exp = await exportAuditChain(id);
    if (exp.verification.headHash) {
      heads.push({
        stampId: id,
        headHash: exp.verification.headHash,
        valid: exp.verification.valid,
        exportedAt: new Date().toISOString(),
      });
    }
  }
  return heads;
}

async function runAuditHeadAnchor() {
  try {
    const heads = await exportActiveStampHeads();
    if (heads.length === 0) return;

    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), heads }, null, 2);
    appendLocalAnchorLog(heads.map((h) => `${h.exportedAt} ${h.stampId} ${h.headHash}`));

    const pushed = await pushToGithub(payload);
    if (pushed) {
      console.log(`[AuditHeadGithub] Pushed ${heads.length} audit heads to GitHub`);
    } else if (!process.env.GITHUB_AUDIT_TOKEN) {
      console.log(`[AuditHeadGithub] Local log only (${heads.length} heads) — set GITHUB_AUDIT_TOKEN + GITHUB_AUDIT_REPO for external anchor`);
    }
  } catch (err) {
    console.error('[AuditHeadGithub] job error:', err.message);
  }
}

function startAuditHeadGithubJob() {
  if (process.env.AUDIT_GITHUB_ANCHOR_DISABLED === 'true') return;
  cron.schedule('0 * * * *', runAuditHeadAnchor);
  runAuditHeadAnchor().catch((e) => console.error('[AuditHeadGithub] initial:', e.message));
  console.log('[AuditHeadGithub] Hourly audit head export scheduled');
}

module.exports = { runAuditHeadAnchor, startAuditHeadGithubJob };
