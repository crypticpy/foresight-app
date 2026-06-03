-- Persist the full, uncapped research output so we never lose paid AI research data.
--
-- Until now the only durable copy of a research report was:
--   * research_tasks.result_summary.report_preview  (capped at 10KB quick / 50KB deep)
--   * card_timeline_events.metadata.detailed_report  (capped at 50KB, deep only)
-- Both are UI previews. The full report text was discarded after the run, so a
-- re-embed or recovery task could not reconstruct it without re-paying gpt-researcher.
--
-- These columns hold the full text:
--   raw_report  : the raw gpt-researcher report (all research types).
--   full_report : the synthesized comprehensive strategic report (deep research only).
-- TEXT is unbounded in Postgres; values are read by task id, so no index is needed.

ALTER TABLE research_tasks
    ADD COLUMN IF NOT EXISTS raw_report TEXT,
    ADD COLUMN IF NOT EXISTS full_report TEXT;

COMMENT ON COLUMN research_tasks.raw_report IS
    'Full, uncapped raw gpt-researcher report. result_summary.report_preview is the capped UI preview of this.';
COMMENT ON COLUMN research_tasks.full_report IS
    'Full, uncapped synthesized comprehensive strategic report (deep research only). NULL for quick/workstream runs.';
