-- Cost guardrail state: a singleton row tracking the rolling-window
-- "reset point" so admins can lift a tripped guardrail without raising
-- the cap, and the last-alert time so the soft-alert path doesn't spam
-- audit log entries on every check.
--
-- The hard cap, soft threshold, window, and master switch live in
-- ``admin_settings`` (read live). Only mutable runtime state belongs here.

CREATE TABLE IF NOT EXISTS public.cost_guardrail_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    -- When set, the gate only sums llm_usage_events with
    -- created_at >= reset_after, even if the rolling window starts earlier.
    reset_after TIMESTAMPTZ,
    -- Last time we wrote a cost.alert audit row for the soft threshold.
    -- Used to dedupe alerts within a rolling window.
    last_alert_at TIMESTAMPTZ,
    -- Last time the hard cap was tripped (used for UI only).
    last_tripped_at TIMESTAMPTZ,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT cost_guardrail_state_singleton CHECK (id = 1)
);

-- Seed the singleton row so callers can always upsert by id=1.
INSERT INTO public.cost_guardrail_state (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.cost_guardrail_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY cost_guardrail_state_service_role
    ON public.cost_guardrail_state FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.cost_guardrail_state IS
    'Singleton runtime state for the cost guardrail (reset_after / last_alert_at). Caps and window live in admin_settings.';
