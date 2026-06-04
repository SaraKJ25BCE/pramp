const multer = require('multer');
const { validateFileMagic } = require('../utils/fileMagic');

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

function validateUploadedMagic(req, res, next) {
  const files = req.files || (req.file ? [req.file] : []);
  for (const file of files) {
    const check = validateFileMagic(file.buffer, file.mimetype);
    if (!check.ok) {
      return res.status(415).json({ error: check.error });
    }
    if (check.mime && check.mime !== file.mimetype) {
      file.mimetype = check.mime;
    }
  }
  next();
}

module.exports = upload;
module.exports.validateUploadedMagic = validateUploadedMagic;
