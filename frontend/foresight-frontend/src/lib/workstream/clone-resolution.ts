/**
 * Resolve a workstream id that may be an org-template id into the caller's
 * private clone id.
 *
 * After the per-user workstream clones rollout (PR #91), org-owned templates
 * are no longer visible to non-admin users via RLS — they only see their
 * personal `user_clone` workstreams.  Old bookmarks, admin-shared links, or
 * cross-surface links may still point at a template id; the kanban / feed
 * pages call {@link resolveTemplateIdToClone} (or its ensuring variant) to
 * remap those to the user's own clone id before loading.
 *
 * @module lib/workstream/clone-resolution
 */

import { supabase } from "../supabase";
import { listWorkstreams } from "./cards";

/**
 * Return the caller's clone_workstream_id for a given template id, or null
 * when the id is not a template the caller has a clone of (i.e. it's a
 * regular workstream id, or the user has no clone pointer for it).
 *
 * RLS on `user_workstream_clones` restricts SELECT to rows where
 * `user_id = auth.uid()`, so this query is a single round-trip and returns
 * at most one row.
 */
export async function resolveTemplateIdToClone(
  workstreamId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_workstream_clones")
    .select("clone_workstream_id")
    .eq("template_id", workstreamId)
    .maybeSingle();

  if (error) {
    // Don't fail the caller — the resolver is best-effort and any error
    // (network, RLS misconfig, etc.) just falls through to the regular
    // workstream load path. Log so operational failures are visible in the
    // console rather than silently invisible.
    console.warn("resolveTemplateIdToClone: clone lookup failed", error);
    return null;
  }
  if (!data) return null;
  return (data as { clone_workstream_id?: string }).clone_workstream_id ?? null;
}

/**
 * Trigger server-side clone materialization, then retry the local clone
 * resolver. Use this only after a direct workstream fetch has failed in a
 * way consistent with the RLS-blocked-template case — calling it on every
 * load would fire `ensure_user_clones_for_templates` for unrelated normal
 * workstream loads, materializing clones for every org template the user
 * hasn't yet touched.
 *
 * Used when the user navigates directly to a workstream URL (bookmark, shared
 * link, redirect) before they've ever loaded `/workstreams` — the lazy
 * first-touch materialization in the backend's `GET /me/workstreams` hasn't
 * fired yet, so `user_workstream_clones` has no pointer for them and the
 * direct `workstreams` SELECT is RLS-blocked (returns 406).
 *
 * Strategy: call `listWorkstreams(token)` which hits `/api/v1/me/workstreams`
 * and triggers `ensure_user_clones_for_templates` server-side, then run the
 * resolver. Returns null if the id is genuinely not a template the user has
 * a clone of.
 */
export async function materializeAndResolveTemplateClone(
  workstreamId: string,
  token: string,
): Promise<string | null> {
  try {
    await listWorkstreams(token);
  } catch (err) {
    console.warn(
      "materializeAndResolveTemplateClone: materialization call failed",
      err,
    );
    return null;
  }

  return resolveTemplateIdToClone(workstreamId);
}
