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

// Client-direct uploads (listing photos, chat images) never pass through our
// server — this just signs the exact params the client will send, so
// Cloudinary can verify the upload is authorized without us ever handling
// the image bytes ourselves.
function signUpload(folder: string, transformation: string, options: { type?: 'upload' | 'authenticated' } = {}) {
  const timestamp = Math.round(Date.now() / 1000);
  // An empty transformation means "store the original untouched" -- used
  // for document uploads (insurance PDFs) that must not be resized and
  // aren't always images. It must be omitted from the signed params, not
  // signed as "", or Cloudinary rejects the signature.
  const paramsToSign: Record<string, string | number> = { timestamp, folder };
  if (transformation) paramsToSign.transformation = transformation;
  if (options.type) paramsToSign.type = options.type;

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET || 'placeholder-api-secret',
  );

  return {
    signature,
    timestamp,
    apiKey: process.env.CLOUDINARY_API_KEY || 'placeholder-api-key',
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'placeholder-cloud-name',
    folder,
    ...(transformation ? { transformation } : {}),
    ...(options.type ? { type: options.type } : {}),
  };
}

export function signListingUpload() {
  return signUpload('listings', 'w_1600,h_1600,c_limit');
}

export function signChatUpload() {
  return signUpload('chat', 'w_1600,h_1600,c_limit');
}

// Same public-upload mechanism as listing/chat photos — there's no separate
// authenticated-delivery setup here, so these URLs are unlisted (never
// surfaced in any list/browse response) but not access-controlled beyond
// that, same as the rest of this app's Cloudinary usage.
export function signVerificationUpload() {
  return signUpload('verification', 'w_1600,h_1600,c_limit');
}

export function signDisputeEvidenceUpload() {
  return signUpload('disputes', 'w_1600,h_1600,c_limit');
}

export function signReportEvidenceUpload() {
  return signUpload('reports', 'w_1600,h_1600,c_limit');
}

// Unlike every folder above, parcel evidence is genuinely access-controlled:
// type "authenticated" means the upload itself is never publicly reachable —
// viewing it requires a freshly-signed delivery URL (getParcelEvidenceViewUrl
// below), not just an unlisted-but-public one. Per SCRUM-137's security
// note: evidence photos can reveal buyer/seller item details, so this is the
// one Cloudinary folder in this app that needs real access control, not
// just security-by-obscurity.
export function signParcelEvidenceUpload() {
  return signUpload('parcel-evidence', 'w_1600,h_1600,c_limit', { type: 'authenticated' });
}

// The value stored in ParcelEvidence.imageUrl is the Cloudinary public_id
// returned by the signed upload above, not a directly-usable URL — a fresh
// signed delivery URL must be generated here every time it's actually
// displayed, since "authenticated" assets 404 without one.
export function getParcelEvidenceViewUrl(publicId: string): string {
  return cloudinary.url(publicId, {
    type: 'authenticated',
    sign_url: true,
    secure: true,
  });
}

// A separate folder from Fulfilment's parcel-evidence, not a shared one --
// same reasoning as keeping Collect UK's tracking-token secret and RBAC
// tables independent from Fulfilment's. Proof-of-collection photos can
// reveal a customer's address/parcel contents, so authenticated delivery
// applies here too.
export function signCollectUkProofUpload() {
  return signUpload('collect-uk-proof', 'w_1600,h_1600,c_limit', { type: 'authenticated' });
}

// Driver application documents (van photo, insurance certificates) --
// authenticated delivery like proof photos: these contain personal and
// financial details and must never be publicly fetchable. No incoming
// transformation: certificates are frequently PDFs (which must not be
// image-resized) and are stored exactly as submitted for review.
export function signCollectUkDriverDocUpload() {
  return signUpload('collect-uk-driver-docs', '', { type: 'authenticated' });
}

export function getCollectUkDriverDocViewUrl(publicId: string): string {
  // Deliver as a web image so the reviewer can always open it: for a JPG
  // this is a passthrough, and for a PDF certificate Cloudinary renders
  // the first page (authenticated *image* delivery works; delivering the
  // raw authenticated PDF 401s). Insurance certificates are typically a
  // single page; a multi-page doc shows page one.
  return cloudinary.url(publicId, {
    type: 'authenticated',
    format: 'jpg',
    sign_url: true,
    secure: true,
  });
}

export function getCollectUkProofViewUrl(publicId: string): string {
  return cloudinary.url(publicId, {
    type: 'authenticated',
    sign_url: true,
    secure: true,
  });
}
