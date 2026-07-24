// Thin re-export shim: the Supabase clients now live in the shared @faira/db
// package (all products share one Supabase project). Kept so existing
// `from '../supabase'` imports keep working.
export { supabaseAdmin, supabasePublic } from '@faira/db/supabase';
