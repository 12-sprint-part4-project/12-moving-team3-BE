import multer from 'multer';
import { AppError } from '../utils/app.error';

const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const fileFilter: multer.Options['fileFilter'] = (_req, file, callback) => {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
    callback(new AppError('INVALID_IMAGE_FORMAT'));
    return;
  }

  callback(null, true);
};

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter,
});
