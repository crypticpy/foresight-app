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
 * Resolve a template id to the caller's clone id, materializing the clone
 * server-side if it doesn't exist yet.
 *
 * Used when the user navigates directly to a workstream URL (bookmark, shared
 * link, redirect) before they've ever loaded `/workstreams` — the lazy
 * first-touch materialization in the backend's `GET /me/workstreams` hasn't
 * fired yet, so `user_workstream_clones` has no pointer for them and the
 * caller would otherwise fall through to a direct `workstreams` SELECT,
 * which RLS now blocks for org templates (returns 406).
 *
 * Strategy: try the local resolver first (one round-trip). On null, call
 * `listWorkstreams(token)` which hits `/api/v1/me/workstreams` and triggers
 * `ensure_user_clones_for_templates` server-side, then retry the resolver.
 * If still null, the id is genuinely not a template — return null and let
 * the caller fall through to its regular load path.
 */
export async function resolveTemplateIdToCloneEnsuring(
  workstreamId: string,
  token: string,
): Promise<string | null> {
  const first = await resolveTemplateIdToClone(workstreamId);
  if (first) return first;

  try {
    await listWorkstreams(token);
  } catch (err) {
    console.warn(
      "resolveTemplateIdToCloneEnsuring: materialization call failed",
      err,
    );
    return null;
  }

  return resolveTemplateIdToClone(workstreamId);
}
