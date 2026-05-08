-- Signal-level follower count helper, backed by the existing card_follows table.

CREATE INDEX IF NOT EXISTS idx_card_follows_user_created
    ON public.card_follows (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_card_follows_card_id
    ON public.card_follows (card_id);

CREATE OR REPLACE FUNCTION public.card_follower_counts(card_ids UUID[])
RETURNS TABLE (card_id UUID, follower_count INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT cf.card_id, COUNT(DISTINCT cf.user_id)::int AS follower_count
    FROM public.card_follows cf
    WHERE cf.card_id = ANY(card_ids)
    GROUP BY cf.card_id;
$$;

GRANT EXECUTE ON FUNCTION public.card_follower_counts(UUID[]) TO authenticated;
