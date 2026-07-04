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

// Listing photos upload directly from the client to Cloudinary (not routed
// through our server) — this just signs the exact params the client will
// send, so Cloudinary can verify the upload is authorized without us ever
// handling the image bytes.
export function signListingUpload() {
  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = {
    timestamp,
    folder: 'listings',
    transformation: 'w_1600,h_1600,c_limit',
  };

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET || 'placeholder-api-secret',
  );

  return {
    signature,
    timestamp,
    apiKey: process.env.CLOUDINARY_API_KEY || 'placeholder-api-key',
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'placeholder-cloud-name',
    folder: paramsToSign.folder,
    transformation: paramsToSign.transformation,
  };
}
