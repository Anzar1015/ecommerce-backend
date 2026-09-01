import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB per image
const MAX_FILES = 6;

// Memory storage: files are streamed straight to Cloudinary, never written to disk.
const storage = multer.memoryStorage();

function imageFileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  if (!file.mimetype.startsWith('image/')) {
    cb(new Error('Only image files are allowed'));
    return;
  }
  cb(null, true);
}

/** Handles up to 6 product images sent under the "images" multipart field. */
export const uploadProductImages = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_FILES },
}).array('images', MAX_FILES);

/** Handles a single category image sent under the "image" multipart field. */
export const uploadCategoryImage = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
}).single('image');

/** Handles up to 4 review images sent under the "images" multipart field. */
export const uploadReviewImages = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 4 },
}).array('images', 4);
