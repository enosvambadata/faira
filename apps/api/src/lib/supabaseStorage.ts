import { supabaseAdmin } from '../supabase';

const VERIFICATION_BUCKET = 'seller-verification';
const UPLOAD_URL_TTL_SECONDS = 5 * 60;
const VIEW_URL_TTL_SECONDS = 5 * 60;

export type VerificationDocType = 'ID' | 'BUSINESS' | 'SHOP_PHOTO';

// Signed, server-mediated uploads directly to a private Supabase Storage
// bucket — no bucket-level RLS policy exists (or is needed) because only
// this service-role-authenticated call can mint a signed upload URL in
// the first place; the client never gets bucket credentials of its own.
// Object paths are never exposed as public URLs anywhere in the API.
export async function createVerificationUploadUrl(sellerId: string, docType: VerificationDocType) {
  const path = `${sellerId}/${docType.toLowerCase()}-${Date.now()}`;

  const { data, error } = await supabaseAdmin.storage
    .from(VERIFICATION_BUCKET)
    .createSignedUploadUrl(path);

  if (error) throw error;

  return { path, signedUrl: data.signedUrl, token: data.token, expiresIn: UPLOAD_URL_TTL_SECONDS };
}

export async function getVerificationViewUrl(path: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(VERIFICATION_BUCKET)
    .createSignedUrl(path, VIEW_URL_TTL_SECONDS);

  if (error) return null;
  return data.signedUrl;
}
