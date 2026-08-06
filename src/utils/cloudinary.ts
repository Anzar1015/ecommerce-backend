import { Readable } from 'stream';
import { cloudinary } from '../config/cloudinary';
import { logger } from './logger';

export interface UploadedImage {
  url: string;
  publicId: string;
}

/**
 * Streams an in-memory file buffer (from Multer's memory storage) straight
 * to Cloudinary, avoiding any temp-file writes to disk.
 */
export function uploadImageBuffer(buffer: Buffer, folder: string): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error || !result) {
          return reject(error ?? new Error('Cloudinary upload failed'));
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    Readable.from(buffer).pipe(uploadStream);
  });
}

/**
 * Best-effort delete: image cleanup should never block the primary
 * operation (e.g. deleting a product) from succeeding.
 */
export async function deleteImage(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    logger.warn('Failed to delete Cloudinary image', { publicId, error });
  }
}
