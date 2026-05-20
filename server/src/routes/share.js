const express = require('express');
const prisma = require('../config/prisma');

const router = express.Router();

const SITE_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const SITE_NAME = 'ProofStamp';

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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
    const imageUrl = stamp.thumbnailUrl || stamp.originalFileUrl || '';
    const pageUrl = `${SITE_URL}/p/${stamp.id}`;
    const verifyUrl = `${SITE_URL}/verify?id=${stamp.id}`;

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
  ${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">` : ''}
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  ${imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">` : ''}
  
  <!-- JSON-LD -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "name": "${escapeHtml(stamp.title)}",
    "author": { "@type": "Person", "name": "${escapeHtml(passport.displayName)}" },
    "dateCreated": "${stamp.createdAt.toISOString()}",
    "license": "${escapeHtml(stamp.license)}",
    "identifier": "${stamp.id}"
  }
  </script>

  <meta http-equiv="refresh" content="0;url=${escapeHtml(pageUrl)}">
</head>
<body>
  <p>Redirecting to <a href="${escapeHtml(pageUrl)}">${escapeHtml(title)}</a>...</p>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
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
