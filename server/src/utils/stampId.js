const STAMP_ID_REGEX = /^PS-\d{4}-[A-Z0-9]{5}$/;

function isValidStampId(stampId) {
  return typeof stampId === 'string' && STAMP_ID_REGEX.test(stampId.trim());
}

function normalizeStampId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  const match = trimmed.match(/PS-\d{4}-[A-Z0-9]{5}/);
  return match ? match[0] : (STAMP_ID_REGEX.test(trimmed) ? trimmed : null);
}

module.exports = { STAMP_ID_REGEX, isValidStampId, normalizeStampId };
