// ============================================
// CLOUD STORAGE SERVICE (Cloudinary)
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import { v2 as cloudinary } from 'cloudinary';

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key: API_KEY,
  api_secret: API_SECRET,
  secure: true,
});

console.log('☁️  Cloudinary config:', {
  cloud_name: CLOUD_NAME,
  api_key: API_KEY ? 'present' : 'missing',
  api_secret: API_SECRET ? 'present' : 'missing',
});

// Upload a photo with high quality
export async function uploadPhoto(filePath: string, folder = 'future-jobs-pro/photos'): Promise<string> {
  console.log(`☁️  Uploading to Cloudinary: ${filePath}`);
  const result = await cloudinary.uploader.upload(filePath, {
    folder,
    resource_type: 'image',
    use_filename: true,
    unique_filename: true,
    overwrite: false,
    tags: ['photo', 'job-site'],
    // Preserve original quality
    transformation: [
      { quality: 'auto:best', fetch_format: 'auto' },
    ],
  });
  console.log(`✅ Cloudinary upload complete: ${result.secure_url}`);
  return result.secure_url;
}

// Delete a photo from Cloudinary by its public ID (extracted from URL)
export async function deletePhoto(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId);
    console.log(`🗑️  Deleted Cloudinary asset: ${publicId}`);
  } catch (error) {
    console.error('Failed to delete Cloudinary asset:', error);
  }
}

// Upload a video (future use)
export async function uploadVideo(filePath: string, folder = 'future-jobs-pro/videos'): Promise<string> {
  console.log(`☁️  Uploading video to Cloudinary: ${filePath}`);
  const result = await cloudinary.uploader.upload(filePath, {
    folder,
    resource_type: 'video',
    use_filename: true,
    unique_filename: true,
    overwrite: false,
  });
  console.log(`✅ Cloudinary video upload complete: ${result.secure_url}`);
  return result.secure_url;
}

// Documents, images, audio, and video. Cloudinary chooses the correct resource type.
export async function uploadAttachment(filePath: string, folder = 'future-jobs-pro/attachments'): Promise<string> {
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) throw new Error('Cloudinary is not configured');
  const result = await cloudinary.uploader.upload(filePath, {
    folder,
    resource_type: 'auto',
    use_filename: true,
    unique_filename: true,
    overwrite: false,
  });
  return result.secure_url;
}

console.log('☁️  Cloud Storage Service loaded – Future Jobs Pro AI by Samuel B.');
