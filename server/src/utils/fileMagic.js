/**
 * Validate file content by magic bytes (not spoofable Content-Type).
 */
const SIGNATURES = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46] },
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], extra: (buf) => buf.length >= 12 && buf.slice(8, 12).toString() === 'WEBP' },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: 'audio/mpeg', bytes: [0xff, 0xfb], alt: [0x49, 0x44, 0x33] },
  { mime: 'audio/wav', bytes: [0x52, 0x49, 0x46, 0x46], extra: (buf) => buf.length >= 12 && buf.slice(8, 12).toString() === 'WAVE' },
  { mime: 'audio/ogg', bytes: [0x4f, 0x67, 0x67, 0x53] },
  { mime: 'audio/flac', bytes: [0x66, 0x4c, 0x61, 0x43] },
  { mime: 'video/mp4', bytes: [0x00, 0x00, 0x00], extra: (buf) => buf.length >= 8 && (buf.slice(4, 8).toString() === 'ftyp' || buf[4] === 0x66) },
  { mime: 'video/webm', bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { mime: 'application/zip', bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: 'application/x-tar', bytes: [0x75, 0x73, 0x74, 0x61, 0x72] },
  { mime: 'font/ttf', bytes: [0x00, 0x01, 0x00, 0x00] },
  { mime: 'font/otf', bytes: [0x4f, 0x54, 0x54, 0x4f] },
  { mime: 'font/woff', bytes: [0x77, 0x4f, 0x46, 0x46] },
  { mime: 'font/woff2', bytes: [0x77, 0x4f, 0x46, 0x32] },
];

const TEXT_PREFIXES = ['text/', 'application/json', 'application/javascript'];

function matchesSignature(buf, sig) {
  if (!buf || buf.length < sig.bytes.length) return false;
  const head = [...sig.bytes];
  if (!head.every((b, i) => buf[i] === b)) {
    if (sig.alt && sig.alt.length <= buf.length) {
      return sig.alt.every((b, i) => buf[i] === b);
    }
    return false;
  }
  if (sig.extra && !sig.extra(buf)) return false;
  return true;
}

function detectMimeFromBuffer(buffer, declaredMime) {
  if (!buffer || buffer.length < 4) return null;

  for (const sig of SIGNATURES) {
    if (matchesSignature(buffer, sig)) return sig.mime;
  }

  if (declaredMime && TEXT_PREFIXES.some((p) => declaredMime.startsWith(p))) {
    const sample = buffer.slice(0, Math.min(512, buffer.length)).toString('utf8');
    const ctrl = (sample.match(/[\x00-\x08\x0e-\x1f]/g) || []).length;
    if (ctrl / Math.max(sample.length, 1) < 0.05) return declaredMime;
  }

  if (declaredMime === 'image/svg+xml') {
    const head = buffer.slice(0, 256).toString('utf8').trim();
    if (head.startsWith('<') && (head.includes('<svg') || head.includes('<?xml'))) {
      return 'image/svg+xml';
    }
  }

  return null;
}

function validateFileMagic(buffer, declaredMime) {
  const detected = detectMimeFromBuffer(buffer, declaredMime);
  if (!detected) {
    return {
      ok: false,
      error: `File type not recognized or not allowed (declared: ${declaredMime || 'unknown'})`,
    };
  }
  return { ok: true, mime: detected };
}

module.exports = { validateFileMagic, detectMimeFromBuffer };
