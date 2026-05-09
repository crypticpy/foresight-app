-- Add conversation_id to llm_usage_events so admins can replay every LLM call
-- that happened during a single chat conversation (FOIA / audit use case).

ALTER TABLE public.llm_usage_events
    ADD COLUMN IF NOT EXISTS conversation_id UUID
        REFERENCES public.chat_conversations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_llm_usage_events_conversation
    ON public.llm_usage_events (conversation_id, created_at);

REVOKE SELECT (conversation_id) ON public.llm_usage_events FROM anon, authenticated;
