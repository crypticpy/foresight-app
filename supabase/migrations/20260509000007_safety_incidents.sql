-- Safety incidents queue: every prompt-injection match (PR 5) and every
-- usage-anomaly finding from the abuse monitor lands here. Admins triage in
-- the Safety tab next to LLM activity.
--
-- We keep both kinds in one table so the admin queue is a single sortable
-- list. ``kind`` discriminates ``injection`` vs ``abuse``. Other useful
-- discriminators (``severity``, ``disposition``) get their own columns to
-- keep filters cheap.

CREATE TABLE IF NOT EXISTS public.safety_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Discriminators
    kind TEXT NOT NULL CHECK (kind IN ('injection', 'abuse')),
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
    source TEXT NOT NULL CHECK (source IN ('discovery', 'chat', 'monitor')),

    -- Subject links (any of these may be null depending on origin)
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
    discovered_source_id UUID REFERENCES public.discovered_sources(id) ON DELETE SET NULL,

    -- The signal itself
    pattern_id TEXT NOT NULL,             -- e.g. injection.instruction_override.ignore
    category TEXT NOT NULL,               -- coarser group: instruction_override / abuse / etc
    excerpt TEXT,                         -- redacted snippet around the match (or anomaly description)
    metadata JSONB NOT NULL DEFAULT '{}',

    -- Admin disposition
    disposition TEXT CHECK (disposition IN ('true_positive', 'false_positive', 'needs_review')),
    reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_safety_incidents_kind_created
    ON public.safety_incidents (kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_safety_incidents_open
    ON public.safety_incidents (severity, created_at DESC)
    WHERE disposition IS NULL;

CREATE INDEX IF NOT EXISTS idx_safety_incidents_user
    ON public.safety_incidents (user_id, created_at DESC);

-- Service role only. Admin reads go through the API which uses the service
-- key; ordinary authed users have no business reading their neighbours'
-- incidents.
ALTER TABLE public.safety_incidents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.safety_incidents FROM anon, authenticated;
GRANT ALL ON public.safety_incidents TO service_role;

COMMENT ON TABLE public.safety_incidents IS
    'Prompt-injection matches and usage-anomaly findings awaiting admin triage.';
COMMENT ON COLUMN public.safety_incidents.kind IS
    'injection | abuse — discriminator between the two upstream detectors.';
COMMENT ON COLUMN public.safety_incidents.disposition IS
    'NULL = not yet reviewed; otherwise the admin verdict.';
