-- Migration: cleanup_orphaned_research_tasks
-- Created at: 20260603000002
-- Description:
--   Delete research_tasks rows whose card_id points to a card that no longer
--   exists. These rows were orphaned by an earlier card-library reseed: the
--   referenced cards were dropped and replaced, leaving the tasks dangling.
--
--   Diagnosed 2026-06-03: 728 orphaned rows (out of 3,031 with a card_id),
--   all created 2025-12 .. 2026-02 (pre-pilot dev/seed era). None are
--   recoverable — the topics they describe (Cool Pavement, Urban Air
--   Mobility, V2G, etc.) are not present in the current card library, so no
--   re-link is possible. Breakdown: 629 `update` jobs + 18 `deep_research`
--   reports carry generated report_preview text for deleted cards; the rest
--   are empty/failed jobs.
--
--   Why this matters now: the companion migration
--   20260603000001_research_tasks_shared_card_read broadened the SELECT RLS
--   policy to expose any card-attached research_task (card_id IS NOT NULL) to
--   all authenticated users. Orphaned rows point at non-existent cards, so
--   they never render in the UI, but they would still be readable via a
--   direct query. Removing them keeps that shared surface limited to live
--   cards.
--
--   Telemetry is preserved automatically: llm_usage_events.task_id and
--   external_api_usage_events.task_id reference research_tasks(id) with
--   ON DELETE SET NULL (see 20260507000003_pilot_usage_collaboration), so the
--   cost/usage history survives with a null task_id rather than cascading.
--
--   Idempotent: re-running deletes 0 rows once the orphans are gone.

BEGIN;

DELETE FROM public.research_tasks rt
WHERE rt.card_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.cards c WHERE c.id = rt.card_id
  );

COMMIT;
