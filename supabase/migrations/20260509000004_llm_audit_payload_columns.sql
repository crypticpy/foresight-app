-- Extend llm_usage_events with redacted payload columns so the admin audit
-- tab can show what was actually sent to / returned by each LLM call. Capture
-- is gated by the FORESIGHT_AUDIT_LLM_CONTENT admin_settings flag (default
-- false in production) — these columns stay NULL when the flag is off.
--
-- All payload columns are nullable. ``prompt_messages_full_ref`` is reserved
-- for a future cold-storage URI (S3 / Supabase Storage) when full message
-- arrays exceed the excerpt cap.

ALTER TABLE public.llm_usage_events
    ADD COLUMN IF NOT EXISTS prompt_excerpt          TEXT,
    ADD COLUMN IF NOT EXISTS response_excerpt        TEXT,
    ADD COLUMN IF NOT EXISTS tool_calls              JSONB,
    ADD COLUMN IF NOT EXISTS redaction_flags         JSONB,
    ADD COLUMN IF NOT EXISTS prompt_messages_full_ref TEXT;

COMMENT ON COLUMN public.llm_usage_events.prompt_excerpt IS
    'Redacted, truncated (≤4 KB) snapshot of the request messages. NULL when audit-content capture is disabled.';
COMMENT ON COLUMN public.llm_usage_events.response_excerpt IS
    'Redacted, truncated (≤4 KB) snapshot of the response text. NULL for streaming and when capture is disabled.';
COMMENT ON COLUMN public.llm_usage_events.tool_calls IS
    'Tool/function calls emitted by the model, sanitized of arguments.';
COMMENT ON COLUMN public.llm_usage_events.redaction_flags IS
    'Sorted list of redaction tags fired against this event (e.g. ["EMAIL","API_KEY"]).';
COMMENT ON COLUMN public.llm_usage_events.prompt_messages_full_ref IS
    'Optional cold-storage URI for the full pre-redaction message array. Reserved for future use.';

-- Existing indexes already cover (created_at), (user_id, created_at),
-- (operation, created_at). No additional indexes are needed for the audit
-- list endpoint in PR 2; we filter on those columns plus model/status, both
-- low-cardinality.
