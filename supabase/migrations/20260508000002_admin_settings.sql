-- Admin console persisted settings.

CREATE TABLE IF NOT EXISTS public.admin_settings (
    key TEXT PRIMARY KEY,
    -- value is nullable: clearing a number-typed override (e.g.
    -- FORESIGHT_MAX_RESEARCH_TASK_ESTIMATED_COST_USD) sets value to NULL,
    -- which the API treats as "fall back to env / default" without
    -- deleting the row.
    value JSONB,
    value_type TEXT NOT NULL CHECK (value_type IN ('string', 'number', 'boolean', 'json')),
    group_name TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_settings_group
    ON public.admin_settings (group_name, key);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_settings_service_role
    ON public.admin_settings FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.admin_settings IS
    'Persisted administrative configuration overrides for model, chat, research, and runtime settings.';
