import { createClient } from '@supabase/supabase-js';

// Used only for Realtime subscriptions — auth/data still goes through our
// own API (see api.ts). Disabling supabase-js's own session persistence
// avoids it fighting with session.ts, which already owns the access token.
export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
);

// Realtime's Postgres Changes policies check auth.uid() against the JWT on
// the socket connection, not against our own API's Bearer header — this has
// to be set explicitly before subscribing since we don't use supabase-js's
// own sign-in flow.
export function setRealtimeAuth(accessToken: string | null) {
  supabase.realtime.setAuth(accessToken);
}
