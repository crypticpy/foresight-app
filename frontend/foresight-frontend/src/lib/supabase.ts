/**
 * Supabase client singleton.
 *
 * Centralizes the `createClient` call so callers don't have to import the
 * client from a routing/entrypoint module. If the env vars are missing the
 * client falls back to a typed-null sentinel (the existing app behavior)
 * — code paths that need Supabase already gate on this implicitly via the
 * auth flow.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
  );
}

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : (null as unknown as ReturnType<typeof createClient>);
