
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Garante que o diretório temporário existe
const uploadDir = path.resolve(__dirname, '../../uploads/temp');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB Max
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['video/mp4', 'video/mkv', 'video/quicktime', 'video/x-matroska'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP4, MKV and MOV are allowed.'));
    }
  },
});
