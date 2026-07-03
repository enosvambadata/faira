import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Anon-key client for user-facing auth flows (OTP send/verify) that are
// meant to run as the calling user, not with service-role privileges.
export const supabasePublic = createClient(
  process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'placeholder-anon-key',
  { auth: { autoRefreshToken: false, persistSession: false } },
);
