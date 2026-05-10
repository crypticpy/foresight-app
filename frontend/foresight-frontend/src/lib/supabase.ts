/**
 * Supabase client singleton.
 *
 * The app cannot function without these env vars — auth, queries, and
 * RPC all depend on the client. We fail fast at module load so the
 * developer sees a clear error rather than a downstream null-method
 * crash. Callers can therefore treat `supabase` as a real, non-null
 * client without per-call guards.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
