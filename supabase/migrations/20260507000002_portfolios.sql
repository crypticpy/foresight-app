-- Portfolios: curated card collections that drive the existing portfolio
-- presentation export. A portfolio may be scoped to a single workstream
-- (Phase 1) or span multiple workstreams (Phase 2). The same schema covers
-- both: ``workstream_id`` is nullable.

CREATE TABLE IF NOT EXISTS public.portfolios (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT NOT NULL,
    description      TEXT,
    user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workstream_id    UUID REFERENCES public.workstreams(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_exported_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_portfolios_user_id
    ON public.portfolios (user_id);
CREATE INDEX IF NOT EXISTS idx_portfolios_workstream_id
    ON public.portfolios (workstream_id);

CREATE TABLE IF NOT EXISTS public.portfolio_items (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
    card_id      UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
    position     INTEGER NOT NULL DEFAULT 0,
    notes        TEXT,
    added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (portfolio_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_items_portfolio_position
    ON public.portfolio_items (portfolio_id, position);
CREATE INDEX IF NOT EXISTS idx_portfolio_items_card_id
    ON public.portfolio_items (card_id);

ALTER TABLE public.portfolios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_items  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own portfolios"
    ON public.portfolios
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage own portfolio items"
    ON public.portfolio_items
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.portfolios p
            WHERE p.id = portfolio_items.portfolio_id
              AND p.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.portfolios p
            WHERE p.id = portfolio_items.portfolio_id
              AND p.user_id = auth.uid()
        )
    );

CREATE OR REPLACE FUNCTION public.touch_portfolios_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS portfolios_updated_at ON public.portfolios;
CREATE TRIGGER portfolios_updated_at
    BEFORE UPDATE ON public.portfolios
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_portfolios_updated_at();
