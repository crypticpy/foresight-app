-- Phase 3 collaboration feature tables and account-type gates.
-- Additive migration: all new surfaces remain backend-authorized and flag-gated.

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'paid'
    CHECK (account_type IN ('paid', 'guest'));

CREATE INDEX IF NOT EXISTS idx_users_account_type ON public.users (account_type);

CREATE TABLE IF NOT EXISTS public.workstream_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workstream_id UUID NOT NULL REFERENCES public.workstreams(id) ON DELETE CASCADE,
    email TEXT,
    intended_role TEXT NOT NULL CHECK (intended_role IN ('editor','commenter','viewer')),
    intended_account_type TEXT NOT NULL DEFAULT 'paid' CHECK (intended_account_type IN ('paid','guest')),
    token TEXT NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    consumed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workstream_invites_workstream
    ON public.workstream_invites (workstream_id);
CREATE INDEX IF NOT EXISTS idx_workstream_invites_token
    ON public.workstream_invites (token);
CREATE INDEX IF NOT EXISTS idx_workstream_invites_email_lower
    ON public.workstream_invites (lower(email));

CREATE TABLE IF NOT EXISTS public.comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type TEXT NOT NULL CHECK (target_type IN ('card','workstream','portfolio','brief')),
    target_id UUID NOT NULL,
    workstream_id UUID REFERENCES public.workstreams(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    body_markdown TEXT NOT NULL,
    body_html TEXT,
    mentions UUID[] DEFAULT '{}',
    resolved_at TIMESTAMPTZ,
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_target
    ON public.comments (target_type, target_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_workstream
    ON public.comments (workstream_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_author
    ON public.comments (author_id);

CREATE TABLE IF NOT EXISTS public.comment_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL CHECK (emoji IN ('thumbs_up','target','flag','check','question')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (comment_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS public.workstream_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workstream_id UUID NOT NULL REFERENCES public.workstreams(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workstream_activity_ws_created
    ON public.workstream_activity (workstream_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workstream_activity_actor
    ON public.workstream_activity (actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.collaboration_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    workstream_id UUID REFERENCES public.workstreams(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    target_type TEXT,
    target_id UUID,
    payload JSONB NOT NULL DEFAULT '{}',
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collab_notifications_user_unread
    ON public.collaboration_notifications (user_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS public.share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type TEXT NOT NULL CHECK (target_type IN ('portfolio','brief','card')),
    target_id UUID NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    view_count INTEGER NOT NULL DEFAULT 0,
    last_viewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_links_target
    ON public.share_links (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_share_links_token
    ON public.share_links (token);

CREATE TABLE IF NOT EXISTS public.workstream_presence (
    workstream_id UUID NOT NULL REFERENCES public.workstreams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workstream_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workstream_presence_recent
    ON public.workstream_presence (workstream_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.audit_collaboration_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id UUID,
    before_state JSONB,
    after_state JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_collab_created
    ON public.audit_collaboration_events (created_at DESC);

ALTER TABLE public.workstream_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workstream_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaboration_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workstream_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_collaboration_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages workstream invites"
    ON public.workstream_invites FOR ALL TO service_role
    USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages comments"
    ON public.comments FOR ALL TO service_role
    USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages comment reactions"
    ON public.comment_reactions FOR ALL TO service_role
    USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages workstream activity"
    ON public.workstream_activity FOR ALL TO service_role
    USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages collaboration notifications"
    ON public.collaboration_notifications FOR ALL TO service_role
    USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages share links"
    ON public.share_links FOR ALL TO service_role
    USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages workstream presence"
    ON public.workstream_presence FOR ALL TO service_role
    USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages collaboration audit events"
    ON public.audit_collaboration_events FOR ALL TO service_role
    USING (true) WITH CHECK (true);
