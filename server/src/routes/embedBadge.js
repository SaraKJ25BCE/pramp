const express = require('express');
const prisma = require('../config/prisma');

const router = express.Router();

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Lightweight HTML badge for iframe embeds (portfolio sites).
 * Embed: <iframe src="{SERVER_URL}/embed/badge/{stampId}" ...
 */
router.get('/badge/:stampId', async (req, res) => {
  try {
    const stamp = await prisma.stamp.findUnique({
      where: { id: req.params.stampId },
      include: { passport: { select: { username: true, displayName: true } } },
    });

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    res.setHeader('Content-Security-Policy', 'frame-ancestors *');

    if (!stamp) {
      const html404 = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;font-family:system-ui,sans-serif;font-size:12px;padding:6px;color:#666;">Badge: stamp not found</body></html>`;
      res.status(404).type('html').send(html404);
      return;
    }

    const title = stamp.title.substring(0, 80);
    const verifyUrl = `${clientUrl}/verify?id=${stamp.id}`;
    const shareUrl = `${clientUrl}/p/${stamp.id}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(stamp.title)} — ProofStamp</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif;
    background: linear-gradient(135deg, #eef2ff 0%, #f8fafc 100%); color: #1e293b; }
  a { color: inherit; text-decoration: none; }
  .wrap {
    padding: 8px 12px;
    border: 1px solid #cbd5f5;
    border-radius: 12px;
    background: rgba(255,255,255,0.92);
    box-shadow: 0 1px 8px rgba(79,70,229,0.12);
    min-width: 200px;
  }
  .row { display: flex; align-items: center; gap: 8px; }
  .badge { flex-shrink: 0; font-size: 14px; }
  .muted { font-size: 11px; color: #64748b; margin-top: 4px; }
  .cta { margin-top: 8px; font-size: 12px; font-weight: 600; color: #4f46e5; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="row">
      <span class="badge" aria-hidden="true">\u2693</span>
      <div>
        <div><strong>${escapeHtml(title)}</strong></div>
        <div class="muted">${escapeHtml(stamp.id)} · ${escapeHtml(stamp.passport.username)}</div>
      </div>
    </div>
    <a class="cta" href="${escapeHtml(verifyUrl)}" target="_blank" rel="noopener">Verify authenticity \u2192</a>
  </div>
  <noscript><a href="${escapeHtml(shareUrl)}">View on ProofStamp</a></noscript>
</body>
</html>`;

    res.status(200).type('html').send(html);
  } catch (e) {
    console.error('[embedBadge]', e);
    res.status(500).type('html').send('<body style="margin:8px;font:12px sans-serif">Badge error</body>');
  }
});

module.exports = router;
