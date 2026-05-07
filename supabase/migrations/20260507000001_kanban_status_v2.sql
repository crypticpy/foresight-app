-- ============================================================================
-- Kanban Redesign — Status v2 + Card Attribute Columns
-- ============================================================================
-- Collapses the kanban from 6 columns to 4 stages and lifts orthogonal
-- attributes (watching, brief status, research freshness) into card columns.
--
-- Status mapping:
--   inbox      -> inbox
--   screening  -> working
--   research   -> working
--   brief      -> ready
--   watching   -> inbox  (with is_watching = TRUE)
--   archived   -> archived
--
-- See docs/16_PRD_Kanban_Redesign_and_Sharing.md for the full plan.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Add new attribute columns BEFORE the status migration so we can flip
--    is_watching during the data backfill.
-- ----------------------------------------------------------------------------

ALTER TABLE workstream_cards
    ADD COLUMN IF NOT EXISTS is_watching BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS brief_status TEXT NOT NULL DEFAULT 'none'
        CHECK (brief_status IN ('none', 'draft', 'ready', 'exported')),
    ADD COLUMN IF NOT EXISTS last_research_depth TEXT NOT NULL DEFAULT 'none'
        CHECK (last_research_depth IN ('none', 'quick', 'deep')),
    ADD COLUMN IF NOT EXISTS last_research_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS previous_status TEXT;

-- ----------------------------------------------------------------------------
-- 2. Drop the old CHECK constraint (anonymous; postgres auto-named it
--    `workstream_cards_status_check`).
-- ----------------------------------------------------------------------------

ALTER TABLE workstream_cards
    DROP CONSTRAINT IF EXISTS workstream_cards_status_check;

-- ----------------------------------------------------------------------------
-- 3. Backfill data:
--    - cards in `watching` get is_watching=TRUE and move to `inbox`
--    - cards in `screening` and `research` move to `working`
--    - cards in `brief` move to `ready` and get brief_status='ready'
-- ----------------------------------------------------------------------------

UPDATE workstream_cards
SET is_watching = TRUE,
    status = 'inbox'
WHERE status = 'watching';

UPDATE workstream_cards
SET status = 'working'
WHERE status IN ('screening', 'research');

UPDATE workstream_cards
SET status = 'ready',
    brief_status = 'ready'
WHERE status = 'brief';

-- ----------------------------------------------------------------------------
-- 4. Re-add a CHECK constraint with the new four-value vocabulary.
-- ----------------------------------------------------------------------------

ALTER TABLE workstream_cards
    ADD CONSTRAINT workstream_cards_status_check
        CHECK (status IN ('inbox', 'working', 'ready', 'archived'));

-- ----------------------------------------------------------------------------
-- 5. Update column comment + previous_status comment.
-- ----------------------------------------------------------------------------

COMMENT ON COLUMN workstream_cards.status IS
    'Kanban stage: inbox (untriaged), working (actively investigating), ready (shareable artifact exists), archived (done/dismissed)';

COMMENT ON COLUMN workstream_cards.is_watching IS
    'Watch flag — notify on updates regardless of stage. Orthogonal to status.';

COMMENT ON COLUMN workstream_cards.brief_status IS
    'Brief artifact state: none, draft, ready, exported.';

COMMENT ON COLUMN workstream_cards.last_research_depth IS
    'Most recent research depth run on this card: none, quick, deep.';

COMMENT ON COLUMN workstream_cards.last_research_at IS
    'Timestamp of most recent research run on this card.';

COMMENT ON COLUMN workstream_cards.previous_status IS
    'Status before archive — used to restore to its original column on un-archive.';

-- ----------------------------------------------------------------------------
-- 6. Verify
-- ----------------------------------------------------------------------------

SELECT
    'kanban_status_v2 migration applied' AS status,
    COUNT(*) FILTER (WHERE status = 'inbox')    AS inbox_count,
    COUNT(*) FILTER (WHERE status = 'working')  AS working_count,
    COUNT(*) FILTER (WHERE status = 'ready')    AS ready_count,
    COUNT(*) FILTER (WHERE status = 'archived') AS archived_count,
    COUNT(*) FILTER (WHERE is_watching)         AS watching_count
FROM workstream_cards;
