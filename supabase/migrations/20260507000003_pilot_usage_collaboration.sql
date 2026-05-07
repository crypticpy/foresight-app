-- Pilot usage telemetry and Phase 3 collaboration prep.
-- These tables are intentionally additive so existing pilot data keeps working.

CREATE TABLE IF NOT EXISTS public.llm_usage_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    provider            TEXT NOT NULL DEFAULT 'openai',
    model               TEXT,
    operation           TEXT NOT NULL,
    request_kind        TEXT,
    input_tokens        INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
    output_tokens       INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
    cached_input_tokens INTEGER CHECK (
        cached_input_tokens IS NULL OR cached_input_tokens >= 0
    ),
    total_tokens        INTEGER CHECK (total_tokens IS NULL OR total_tokens >= 0),
    estimated_cost_usd  NUMERIC(12, 8),
    latency_ms          INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
    status              TEXT NOT NULL DEFAULT 'success',
    error_type          TEXT,
    run_id              UUID,
    task_id             UUID REFERENCES public.research_tasks(id) ON DELETE SET NULL,
    card_id             UUID REFERENCES public.cards(id) ON DELETE SET NULL,
    workstream_id       UUID REFERENCES public.workstreams(id) ON DELETE SET NULL,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_events_created_at
    ON public.llm_usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_events_user_created
    ON public.llm_usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_events_task
    ON public.llm_usage_events (task_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_events_workstream
    ON public.llm_usage_events (workstream_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_events_operation
    ON public.llm_usage_events (operation, created_at DESC);

CREATE TABLE IF NOT EXISTS public.external_api_usage_events (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    provider           TEXT NOT NULL,
    operation          TEXT NOT NULL,
    request_kind       TEXT,
    units              INTEGER CHECK (units IS NULL OR units >= 0),
    estimated_cost_usd NUMERIC(12, 8),
    latency_ms         INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
    status             TEXT NOT NULL DEFAULT 'success',
    error_type         TEXT,
    run_id             UUID,
    task_id            UUID REFERENCES public.research_tasks(id) ON DELETE SET NULL,
    card_id            UUID REFERENCES public.cards(id) ON DELETE SET NULL,
    workstream_id      UUID REFERENCES public.workstreams(id) ON DELETE SET NULL,
    metadata           JSONB NOT NULL DEFAULT '{}',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_usage_events_created_at
    ON public.external_api_usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_usage_events_user_created
    ON public.external_api_usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_usage_events_provider
    ON public.external_api_usage_events (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_usage_events_task
    ON public.external_api_usage_events (task_id);

CREATE TABLE IF NOT EXISTS public.workstream_members (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workstream_id UUID NOT NULL REFERENCES public.workstreams(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role          TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'commenter', 'viewer')),
    added_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workstream_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workstream_members_workstream
    ON public.workstream_members (workstream_id);
CREATE INDEX IF NOT EXISTS idx_workstream_members_user
    ON public.workstream_members (user_id);
CREATE INDEX IF NOT EXISTS idx_workstream_members_workstream_role
    ON public.workstream_members (workstream_id, role);

ALTER TABLE public.llm_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_api_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workstream_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own llm usage events"
    ON public.llm_usage_events
    FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = user_id);

CREATE POLICY "Service role manages llm usage events"
    ON public.llm_usage_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Users can view own external usage events"
    ON public.external_api_usage_events
    FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = user_id);

CREATE POLICY "Service role manages external usage events"
    ON public.external_api_usage_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Users can view own workstream memberships"
    ON public.workstream_members
    FOR SELECT
    TO authenticated
    USING (
        (select auth.uid()) = user_id
        OR EXISTS (
            SELECT 1
            FROM public.workstreams w
            WHERE w.id = workstream_members.workstream_id
              AND w.user_id = (select auth.uid())
        )
    );

CREATE POLICY "Service role manages workstream memberships"
    ON public.workstream_members
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_workstream_members_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workstream_members_updated_at ON public.workstream_members;
CREATE TRIGGER workstream_members_updated_at
    BEFORE UPDATE ON public.workstream_members
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_workstream_members_updated_at();
