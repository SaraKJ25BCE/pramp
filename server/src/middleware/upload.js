const multer = require('multer');

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/tiff',
  'application/pdf',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac',
  'video/mp4', 'video/webm', 'video/quicktime',
  'application/postscript', 'image/vnd.adobe.photoshop',
  'text/plain', 'text/html', 'text/css', 'text/javascript', 'application/json',
  'application/javascript', 'text/markdown', 'text/x-python', 'text/x-java-source',
  'application/zip', 'application/x-tar',
  'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
  'model/gltf-binary', 'model/obj',
  'application/octet-stream',
];

const MAX_SIZE = 100 * 1024 * 1024;

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not supported`), false);
    }
  },
});

module.exports = upload;
