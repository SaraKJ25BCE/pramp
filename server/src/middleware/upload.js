const multer = require('multer');

const ALLOWED_TYPES = [
  // Images
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/tiff',
  // Documents
  'application/pdf',
  // Audio
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac',
  // Video
  'video/mp4', 'video/webm', 'video/quicktime',
  // Design files
  'application/postscript', 'image/vnd.adobe.photoshop',
  // Code/Text
  'text/plain', 'text/html', 'text/css', 'text/javascript', 'application/json',
  'application/javascript', 'text/markdown', 'text/x-python', 'text/x-java-source',
  // Archives (for projects)
  'application/zip', 'application/x-tar',
  // Fonts
  'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
  // 3D
  'model/gltf-binary', 'model/obj',
];

const MAX_SIZE = 100 * 1024 * 1024; // 100MB for video/audio

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    // Accept all files — we categorize and handle them server-side
    cb(null, true);
  },
});

module.exports = upload;
