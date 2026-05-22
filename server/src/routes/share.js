const express = require('express');
const sharp = require('sharp');
const axios = require('axios');
const prisma = require('../config/prisma');

const router = express.Router();

const SITE_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const API_URL = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3001}`;
const SITE_NAME = 'ProofStamp';

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

router.get('/:stampId/og-image', async (req, res) => {
  try {
    const stamp = await prisma.stamp.findUnique({
      where: { id: req.params.stampId },
      include: { passport: true },
    });

    if (!stamp) return res.status(404).send('Not found');

    const WIDTH = 1200;
    const HEIGHT = 630;

    let artworkComposite = [];
    if (stamp.category === 'image' && (stamp.thumbnailUrl || stamp.originalFileUrl)) {
      try {
        const imgUrl = stamp.thumbnailUrl || stamp.originalFileUrl;
        const imgResp = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 10000 });
        const artwork = await sharp(Buffer.from(imgResp.data))
          .resize(500, 400, { fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer();
        const meta = await sharp(artwork).metadata();
        artworkComposite.push({
          input: artwork,
          left: Math.round((WIDTH - meta.width) / 2),
          top: Math.round(80 + (340 - meta.height) / 2),
        });
      } catch (e) {
        // Proceed without artwork
      }
    }

    const creatorName = stamp.passport.displayName || stamp.passport.username;
    const dateStr = new Date(stamp.createdAt).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    const svgOverlay = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#1e1b4b"/>
          <stop offset="100%" style="stop-color:#312e81"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <rect x="0" y="0" width="100%" height="4" fill="#818cf8"/>

      <!-- Branding -->
      <text x="48" y="52" font-family="sans-serif" font-weight="bold" font-size="22" fill="#818cf8">PROOFSTAMP</text>
      <rect x="48" y="64" width="80" height="2" rx="1" fill="#818cf8" opacity="0.5"/>

      <!-- Badge -->
      <rect x="${WIDTH - 220}" y="24" width="180" height="32" rx="16" fill="#059669" opacity="0.9"/>
      <text x="${WIDTH - 130}" y="46" font-family="sans-serif" font-weight="bold" font-size="13" fill="white" text-anchor="middle">VERIFIED OWNER</text>

      <!-- Title -->
      <text x="48" y="${HEIGHT - 120}" font-family="sans-serif" font-weight="bold" font-size="32" fill="white">
        ${escapeHtml(stamp.title.length > 40 ? stamp.title.substring(0, 37) + '...' : stamp.title)}
      </text>

      <!-- Creator + meta -->
      <text x="48" y="${HEIGHT - 80}" font-family="sans-serif" font-size="18" fill="#c7d2fe">
        by ${escapeHtml(creatorName)} · ${dateStr}
      </text>

      <!-- Bottom bar -->
      <rect x="0" y="${HEIGHT - 48}" width="100%" height="48" fill="black" opacity="0.3"/>
      <text x="48" y="${HEIGHT - 18}" font-family="sans-serif" font-size="14" fill="#a5b4fc">${stamp.id} · ${escapeHtml(stamp.license)} · Protected</text>
      <text x="${WIDTH - 48}" y="${HEIGHT - 18}" font-family="sans-serif" font-size="12" fill="#6366f1" text-anchor="end">proofstamp.app</text>
    </svg>`;

    const base = sharp(Buffer.from(svgOverlay))
      .resize(WIDTH, HEIGHT)
      .png();

    let image;
    if (artworkComposite.length > 0) {
      image = await base.composite(artworkComposite).png().toBuffer();
    } else {
      image = await base.png().toBuffer();
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(image);
  } catch (error) {
    console.error('OG image error:', error);
    res.status(500).send('Failed to generate image');
  }
});

router.get('/:stampId', async (req, res) => {
  try {
    const stamp = await prisma.stamp.findUnique({
      where: { id: req.params.stampId },
      include: {
        passport: {
          include: { user: { select: { avatarUrl: true } } },
        },
      },
    });

    if (!stamp) {
      return res.status(404).send('<html><body><h1>Stamp not found</h1></body></html>');
    }

    const { passport } = stamp;
    const title = `${stamp.title} — Protected by ${SITE_NAME}`;
    const description = `Created by @${passport.username} • Registered ${new Date(stamp.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} • ${stamp.license}`;
    const imageUrl = `${API_URL}/share/${stamp.id}/og-image`;
    const pageUrl = `${SITE_URL}/p/${stamp.id}`;
    const oembedUrl = `${API_URL}/share/${stamp.id}/oembed`;
    const copyrightYear = new Date(stamp.createdAt).getFullYear();

    const aiRobotsContent = stamp.aiOptOut
      ? '<meta name="robots" content="noai, noimageai">'
      : '';

    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: stamp.title,
      author: { '@type': 'Person', name: passport.displayName },
      dateCreated: stamp.createdAt.toISOString(),
      copyrightHolder: { '@type': 'Person', name: passport.displayName },
      copyrightYear,
      license: stamp.license,
      identifier: stamp.id,
      thumbnailUrl: stamp.thumbnailUrl || stamp.originalFileUrl || '',
      usageInfo: `${SITE_URL}/registry`,
      acquireLicensePage: `${SITE_URL}/p/${stamp.id}`,
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@ProofStamp">
  <meta name="twitter:creator" content="@${escapeHtml(passport.username || '')}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">

  <!-- oEmbed discovery -->
  <link rel="alternate" type="application/json+oembed" href="${escapeHtml(oembedUrl)}" title="${escapeHtml(title)}">

  <!-- AI opt-out -->
  ${aiRobotsContent}

  <!-- JSON-LD structured data -->
  <script type="application/ld+json">${jsonLd}</script>

  <meta http-equiv="refresh" content="0;url=${escapeHtml(pageUrl)}">
</head>
<body>
  <p>Redirecting to <a href="${escapeHtml(pageUrl)}">${escapeHtml(title)}</a>...</p>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (stamp.aiOptOut) {
      res.setHeader('X-Robots-Tag', 'noai, noimageai');
    }
    res.send(html);
  } catch (error) {
    console.error('Share page error:', error);
    res.status(500).send('<html><body><h1>Error loading page</h1></body></html>');
  }
});

router.get('/:stampId/oembed', async (req, res) => {
  try {
    const stamp = await prisma.stamp.findUnique({
      where: { id: req.params.stampId },
      include: { passport: true },
    });

    if (!stamp) return res.status(404).json({ error: 'Not found' });

    res.json({
      version: '1.0',
      type: stamp.category === 'image' ? 'photo' : 'link',
      title: stamp.title,
      author_name: stamp.passport.displayName,
      author_url: `${SITE_URL}/u/${stamp.passport.username}`,
      provider_name: SITE_NAME,
      provider_url: SITE_URL,
      thumbnail_url: stamp.thumbnailUrl || stamp.originalFileUrl,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
