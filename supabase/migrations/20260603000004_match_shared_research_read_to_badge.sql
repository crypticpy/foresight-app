-- Migration: match_shared_research_read_to_badge
-- Created at: 20260603000004
-- Description:
--   Reconcile the cross-user READ predicate on research_tasks with the card
--   "has deep research" badge so the two can never disagree.
--
--   Background (Codex review on PR #242, 2026-06-03):
--     PR #240 broadened SELECT to ANY card-attached research_task; PR #242
--     correctly narrowed it to completed deep_research, but ALSO added a
--     `workstream_id IS NULL` clause. That extra clause is inconsistent with
--     the badge: get_card_artifacts() (app/card_artifacts.py) computes
--     has_deep_research from completed deep_research rows by card_id ONLY —
--     it never looks at workstream_id. The /api/v1/research endpoint
--     (app/routers/research.py) accepts a deep_research task carrying BOTH
--     card_id AND workstream_id (running deep research on a card that belongs
--     to a workstream) and persists both columns. For such a row the badge
--     would advertise a report that the RLS predicate hides from non-owners —
--     re-creating the exact badge/tab mismatch #240 set out to fix.
--
--   Fix:
--     Drop the workstream_id clause. Cross-user read now matches the badge
--     exactly: any COMPLETED deep_research row attached to a card is
--     card-level shared intelligence, readable by every authenticated user.
--     This does NOT re-open the #240 over-exposure — that was about task_type
--     and status, both of which stay constrained here. Truly private analyses
--     are workstream-only (card_id IS NULL) and remain owner-scoped because
--     the predicate still requires card_id IS NOT NULL. Writes are unchanged
--     (strictly owner-scoped via the insert/update/delete policies from
--     migration 20260603000001).
--
--   Lint notes: a single combined SELECT policy avoids the
--   multiple_permissive_policies warning, and (select auth.uid()) avoids the
--   auth_rls_initplan warning — consistent with migrations 20260603000001 /
--   20260603000003. The service role keeps full access via BYPASSRLS.

BEGIN;

DROP POLICY IF EXISTS research_tasks_select ON public.research_tasks;

-- READ: your own rows (any task type) OR any completed, card-attached
-- deep-research report. This mirrors get_card_artifacts() exactly, so the
-- "has deep research" badge and the Deep Research tab can never disagree.
CREATE POLICY research_tasks_select ON public.research_tasks
    FOR SELECT
    TO authenticated
    USING (
        (select auth.uid()) = user_id
        OR (
            task_type = 'deep_research'
            AND status = 'completed'
            AND card_id IS NOT NULL
        )
    );

COMMIT;
