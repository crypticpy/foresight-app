-- Migration: keep_workstream_scoped_research_private
-- Created at: 20260603000005
-- Description:
--   Reconcile the card "has deep research" badge with the research_tasks SELECT
--   RLS policy on the PRIVACY-PRESERVING predicate, reverting the broadening
--   introduced by 20260603000004.
--
--   Context:
--     20260603000003 scoped the cross-user read arm to completed, card-attached
--     deep-research reports that are NOT workstream-scoped (workstream_id IS
--     NULL), keeping workstream-scoped analyses owner-private. 20260603000004
--     then DROPPED the `workstream_id IS NULL` guard so RLS would mirror the
--     badge in card_artifacts.py, which ignored workstream_id.
--
--     Review (PR #243, Codex P2 / Greptile P2) flagged that this aligned the
--     two in the WRONG direction. create_research_task supports queuing a
--     `deep_research` task with BOTH a card_id and a workstream_id (it requires
--     workstream edit access), so dropping the guard would make such a row —
--     including its workstream_id / user_id metadata and any workstream-derived
--     report context — readable by every authenticated user on the public card.
--     No such row exists today (the only UI path, CardDetail's "Deep Research"
--     button, posts card_id with no workstream_id), but RLS must be correct by
--     construction rather than rely on current data.
--
--   Fix:
--     Restore the `workstream_id IS NULL` guard on the shared read arm (back to
--     the 20260603000003 predicate). The companion code change scopes the badge
--     query (card_artifacts.py::_fetch_research) to workstream_id IS NULL as
--     well, so badge and Deep Research tab stay consistent — but consistent on
--     the SAFE set: only global card reports are shared cross-user; workstream-
--     scoped deep research stays private to its owner.
--
--   Lint notes: single combined SELECT policy (avoids
--   multiple_permissive_policies) and (select auth.uid()) (avoids
--   auth_rls_initplan), consistent with 20260603000001 / 20260603000003. The
--   service role keeps full access via BYPASSRLS.

BEGIN;

DROP POLICY IF EXISTS research_tasks_select ON public.research_tasks;

-- READ: your own rows (any task type) OR a completed, card-attached
-- deep-research report that is NOT scoped to a workstream. Workstream-scoped
-- analyses and non-report task types (update, workstream_analysis) stay
-- owner-private.
CREATE POLICY research_tasks_select ON public.research_tasks
    FOR SELECT
    TO authenticated
    USING (
        (select auth.uid()) = user_id
        OR (
            task_type = 'deep_research'
            AND status = 'completed'
            AND card_id IS NOT NULL
            AND workstream_id IS NULL
        )
    );

COMMIT;
