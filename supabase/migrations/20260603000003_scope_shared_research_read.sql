-- Migration: scope_shared_research_read
-- Created at: 20260603000003
-- Description:
--   Tighten the cross-user SELECT arm added in
--   20260603000001_research_tasks_shared_card_read.
--
--   That migration shared every row with a non-null card_id
--   (USING auth.uid() = user_id OR card_id IS NOT NULL). Code review (PR #240,
--   Codex P1 / Greptile P2) flagged that this is broader than intended:
--     - `create_research_task` can produce a `workstream_analysis` task that
--       carries BOTH a workstream_id and a card_id; its result_summary holds
--       workstream-derived findings (private keywords / description-derived
--       analysis). Sharing on card_id alone would expose that private
--       workstream content to every authenticated user. (No such row exists
--       today, but RLS must be correct by construction, not rely on current
--       data.)
--     - `update`-type tasks (card refresh/re-score jobs) also carry a card_id
--       but never surface on the card Deep Research tab, yet were made
--       cross-user enumerable.
--
--   The only surface that genuinely needs cross-user read is the card "Deep
--   Research / Strategic Intelligence Report" tab + its badge, which use
--   completed, card-attached `deep_research` reports
--   (card_artifacts.py: task_type='deep_research', status='completed';
--   DeepResearchPanel filters task_type==='deep_research'). Narrow the shared
--   arm to exactly that set. Owner access is unchanged — owners still read all
--   their own tasks of any type via the auth.uid() = user_id arm.
--
--   Lint notes: single combined SELECT policy (avoids
--   multiple_permissive_policies) and (select auth.uid()) (avoids
--   auth_rls_initplan), consistent with 20260603000001 / 1766739200.

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
