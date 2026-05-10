import { supabase } from "./supabase";

/**
 * Resolve the current Supabase access token, or null if no session exists.
 * Single source of truth for auth-token retrieval — components and hooks
 * should call this directly instead of redefining the same wrapper.
 */
export async function getAuthToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/**
 * Resolve the current Supabase user id, or null if no session exists.
 * Use when filtering Supabase queries by `user_id` / `created_by` on the
 * client; for backend-bound API calls prefer {@link getAuthToken}.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}
