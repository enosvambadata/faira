import { createBrowserClient } from "@supabase/ssr";

// Browser-only client — this app never talks to Postgres or Supabase
// Storage directly; all data access goes through apps/api (same rule as
// apps/mobile). Supabase is used here only for session/auth state.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
