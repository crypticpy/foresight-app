-- Admin tag-merge RPC (PR 7).
--
-- Merging two tags re-points every card_tags junction row pointing at the
-- source onto the target, then deletes the source row. The tricky bit is
-- the (card_id, tag_id, user_id) primary key: if user U has applied both
-- the source and target tags to card C, naively flipping tag_id violates
-- the PK. We pre-delete the source rows that would collide, then UPDATE
-- the rest in one statement, then DELETE the source tag. Wrapping it in a
-- plpgsql function keeps the whole sequence in one transaction so an admin
-- never sees a partial state where the source tag is gone but its
-- applications haven't been re-pointed yet.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_merge_tags(
    p_source_tag_id UUID,
    p_target_tag_id UUID
)
RETURNS TABLE (
    moved_count BIGINT,
    deduped_count BIGINT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_moved BIGINT;
    v_deduped BIGINT;
BEGIN
    IF p_source_tag_id = p_target_tag_id THEN
        RAISE EXCEPTION 'source and target tags must differ';
    END IF;

    -- Pre-emptively delete the source rows that would collide with an
    -- existing target row on the (card, user) pair — without this the
    -- UPDATE below would violate the (card_id, tag_id, user_id) primary
    -- key for any user who's already applied both tags to the same card.
    DELETE FROM public.card_tags ct_src
    WHERE ct_src.tag_id = p_source_tag_id
      AND EXISTS (
          SELECT 1
          FROM public.card_tags ct_tgt
          WHERE ct_tgt.tag_id = p_target_tag_id
            AND ct_tgt.card_id = ct_src.card_id
            AND ct_tgt.user_id = ct_src.user_id
      );
    GET DIAGNOSTICS v_deduped = ROW_COUNT;

    -- Re-point everything else.
    UPDATE public.card_tags
    SET tag_id = p_target_tag_id
    WHERE tag_id = p_source_tag_id;
    GET DIAGNOSTICS v_moved = ROW_COUNT;

    -- Remove the source tag itself. The card_tags FK is ON DELETE CASCADE,
    -- but by this point no card_tags rows reference the source tag, so
    -- nothing further cascades.
    DELETE FROM public.tags WHERE id = p_source_tag_id;

    RETURN QUERY SELECT v_moved, v_deduped;
END;
$$;

-- Service-role only — admin endpoints run through the service-role
-- backend client, never via the authenticated PostgREST role.
GRANT EXECUTE ON FUNCTION public.admin_merge_tags(UUID, UUID) TO service_role;

COMMIT;
