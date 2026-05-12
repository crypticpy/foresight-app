-- Pin search_path on the three remaining functions flagged by the advisor.
--
-- A mutable search_path on a function is a known privilege-escalation
-- vector: a malicious user could create same-named objects in a schema
-- they control and have the function resolve to them. The fix is to pin
-- the search_path on the function with `SET search_path = …`.
--
-- - The two trigger functions only call built-in tsvector helpers and
--   write to `NEW.<column>`; they don't reference any user-schema objects.
--   `public` matches the convention used by the other trigger functions
--   in this database (`update_pattern_insights_updated_at`, etc.).
-- - `match_sources_by_embedding` uses the pgvector `<=>` operator from
--   the `extensions` schema and reads from `public.sources`. Mirror the
--   `extensions, public` setting used by `find_similar_cards` and
--   `find_matching_blocks`.

ALTER FUNCTION public.cards_search_vector_update()
    SET search_path = public;

ALTER FUNCTION public.sources_search_vector_update()
    SET search_path = public;

ALTER FUNCTION public.match_sources_by_embedding(
        query_embedding extensions.vector, target_card_id uuid,
        match_threshold double precision, match_count integer)
    SET search_path = extensions, public;
