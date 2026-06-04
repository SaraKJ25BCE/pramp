function isCloudinaryUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /res\.cloudinary\.com|cloudinary\.com/i.test(url);
}

function isStampCdnReady(stamp) {
  if (!stamp) return false;
  if (stamp.processing === false && isCloudinaryUrl(stamp.originalFileUrl)) return true;
  if (isCloudinaryUrl(stamp.originalFileUrl)) return true;
  return false;
}

module.exports = { isCloudinaryUrl, isStampCdnReady };
