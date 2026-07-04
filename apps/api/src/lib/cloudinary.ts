import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'placeholder-cloud-name',
  api_key: process.env.CLOUDINARY_API_KEY || 'placeholder-api-key',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'placeholder-api-secret',
  secure: true,
});

export async function uploadAvatar(buffer: Buffer, mimetype: string, userId: string) {
  const dataUri = `data:${mimetype};base64,${buffer.toString('base64')}`;

  return cloudinary.uploader.upload(dataUri, {
    folder: 'avatars',
    public_id: userId,
    overwrite: true,
    transformation: [{ width: 200, height: 200, crop: 'fill', gravity: 'face' }],
  });
}
