/**
 * Resolve a workstream id that may be an org-template id into the caller's
 * private clone id.
 *
 * After the per-user workstream clones rollout (PR #91), org-owned templates
 * are no longer visible to non-admin users via RLS — they only see their
 * personal `user_clone` workstreams.  Old bookmarks, admin-shared links, or
 * cross-surface links may still point at a template id; the kanban / feed
 * pages call {@link resolveTemplateIdToClone} to remap those to the user's
 * own clone id before loading.
 *
 * @module lib/workstream/clone-resolution
 */

import { supabase } from "../supabase";

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

  if (error || !data) return null;
  return (data as { clone_workstream_id?: string }).clone_workstream_id ?? null;
}
