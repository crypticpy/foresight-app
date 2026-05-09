-- The audit payload columns added in 20260509000004 are admin-only — they
-- hold redacted prompts and responses surfaced through the admin "LLM
-- activity" tab. The existing user-RLS policy
-- `Users can view own llm usage events` (20260507000003) plus Supabase's
-- default GRANT SELECT on public tables to `authenticated` would otherwise
-- let each user SELECT their own rows including these columns. Revoke
-- column-level SELECT for anon/authenticated; service_role still has full
-- access (admin endpoints use the service-role client).

REVOKE SELECT (
    prompt_excerpt,
    response_excerpt,
    tool_calls,
    redaction_flags,
    prompt_messages_full_ref
) ON public.llm_usage_events FROM anon, authenticated;
