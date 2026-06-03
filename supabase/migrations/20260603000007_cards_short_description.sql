-- Dedicated 2-sentence executive blurb for cards.
--
-- Distinct from the two existing text fields:
--   * summary     — discovery-time short text written when the card is created
--   * description — long rich profile (500-800 words), generated asynchronously
--
-- short_description is an LLM-distilled 2-sentence blurb generated via the mini
-- chat tier at creation/enrichment and stored, so it is generated ONCE and never
-- recomputed on read (avoids paying tokens every time a list/preview needs a blurb).
-- It is NOT part of the embedding input (name + summary + description), so adding
-- it does not require a re-embed.

ALTER TABLE cards ADD COLUMN IF NOT EXISTS short_description TEXT;

COMMENT ON COLUMN cards.short_description IS
    'LLM-distilled 2-sentence executive blurb (mini tier), generated once at creation/enrichment and stored so it is never regenerated on read. Distinct from summary (discovery-time short text) and description (long rich profile). Not part of the embedding input.';
