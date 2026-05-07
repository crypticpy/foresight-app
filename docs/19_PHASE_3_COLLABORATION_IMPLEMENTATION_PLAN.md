# Phase 3 Collaboration — Implementation Plan

> Companion to:
>
> - `17_PILOT_SECURITY_COST_COLLABORATION_PLAN.md` (auth scaffolding & roles)
> - `18_COLLABORATION_FEATURES_PLAN.md` (product surface, user stories)
>
> This doc is the build-order plan: concrete files, endpoints, schemas,
> tests, and feature flags for shipping Phase 3a → 3f. Each phase is
> independently shippable behind a flag.

## Conventions Used Throughout

- All new endpoints under `/api/v1/...`, user-scoped under `/api/v1/me/...`.
- New routers go in `backend/app/routers/<feature>.py` (do **not** add to
  `main.py`); register via `application.include_router(...)` in `main.py`.
- New Pydantic models go in `backend/app/models/<feature>.py` and must be
  re-exported from `backend/app/models/__init__.py` (file + `__all__`).
- Authorization always routes through `backend/app/authz.py` helpers; do
  not hand-roll ownership checks in routers.
- Frontend API clients follow the `apiRequest<T>(endpoint, token, options)`
  pattern in `frontend/foresight-frontend/src/lib/<feature>-api.ts`.
- Migrations go in `supabase/migrations/YYYYMMDDHHMMSS_<desc>.sql` and must
  enable RLS on every new table.
- All paid/mutating actions must check both `require_paid_user(user)` and
  `require_workstream_access(..., capability=...)`.

## Pre-Phase Scaffolding (Land Before 3a)

These are tiny shared changes that every later phase depends on. Bundle in
one PR.

### Backend

- **`authz.py`**: split `commenter` capability from `viewer`.
  - Extend `WorkstreamAccess` with `can_comment: bool`.
  - Update `WORKSTREAM_MEMBER_CAPABILITIES` to a 4-tuple:
    `(read, comment, edit, manage)`.
    - `owner` → `(T, T, T, T)`
    - `editor` → `(T, T, T, F)`
    - `commenter` → `(T, T, F, F)`
    - `viewer` → `(T, F, F, F)`
  - Add `Capability = Literal["read", "comment", "edit", "manage"]`.
  - Update `require_workstream_access` to handle the new capability.
- **`authz.py`**: add `require_paid_user(user)` helper that 403s when
  `profile.account_type == "guest"`. (Column doesn't exist yet — gate the
  read with `.get("account_type", "paid") == "guest"` so it returns False
  until 3c lands.)
- **`deps.py`**: include `account_type` in the cached profile dict
  (default `"paid"`).

### Migration

`supabase/migrations/<ts>_collab_pre_phase.sql`

- `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_type
TEXT NOT NULL DEFAULT 'paid' CHECK (account_type IN ('paid', 'guest'));`
- `CREATE INDEX IF NOT EXISTS idx_profiles_account_type ON public.profiles
(account_type);`

### Feature flags (env)

Add to `backend/.env.example`:

```
FORESIGHT_ENABLE_COLLABORATION=false   # master flag, gates all 3a-3f endpoints
FORESIGHT_ENABLE_GUEST_ACCOUNTS=false  # gates 3c specifically
FORESIGHT_ENABLE_REALTIME=false        # gates 3e
FORESIGHT_ENABLE_PUBLIC_SHARE=false    # gates 3f
```

Each new router's `dependencies=[...]` checks the relevant flag and 404s
if disabled, so the scaffolding is in place without exposing surface area.

## Phase 3a — Member Management (Paid ↔ Paid)

**Goal.** Sally can invite Marcus (an existing paid user) to her workstream
as `editor`/`commenter`/`viewer`, see him in a member list, change his
role, and remove him. Marcus sees the workstream in "Shared with me" and
hits role-appropriate 403s on actions he can't take.

**Acceptance.**

- Owner can list, add, update-role, remove members on their workstream.
- Member sees workstream in `/me/workstreams` results with a `role` field.
- Editor can move kanban cards, queue research, generate briefs.
- Commenter sees the kanban but cannot move cards (UI hides actions, API
  returns 403 if hit directly).
- Viewer cannot move cards or comment.
- Existing single-owner workstream behavior unchanged.

### Data

Migration: `<ts>_workstream_invites.sql`

```sql
CREATE TABLE public.workstream_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workstream_id UUID NOT NULL REFERENCES public.workstreams(id) ON DELETE CASCADE,
    email TEXT,                        -- nullable: link-only invites have no email
    intended_role TEXT NOT NULL CHECK (intended_role IN ('editor','commenter','viewer')),
    intended_account_type TEXT NOT NULL DEFAULT 'paid' CHECK (intended_account_type IN ('paid','guest')),
    token TEXT NOT NULL UNIQUE,        -- 32+ char random; lookup index
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    consumed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_workstream_invites_workstream ON public.workstream_invites (workstream_id);
CREATE INDEX idx_workstream_invites_token ON public.workstream_invites (token);
CREATE INDEX idx_workstream_invites_email_lower ON public.workstream_invites (lower(email));
ALTER TABLE public.workstream_invites ENABLE ROW LEVEL SECURITY;
-- Service role only; all access through backend.
CREATE POLICY "Service role manages workstream invites"
    ON public.workstream_invites FOR ALL TO service_role
    USING (true) WITH CHECK (true);
```

`workstream_members` already exists from migration `20260507000003`.

### Backend

New file: `backend/app/routers/workstream_members.py`

- `GET /api/v1/me/workstreams/{ws_id}/members` → list (any read access).
  Returns `[{user_id, email, display_name, role, added_by, created_at}]`.
- `POST /api/v1/me/workstreams/{ws_id}/members`
  Body: `{user_email, role}`. Manage capability required. Looks up profile
  by lowered email; 404 if no paid user exists with that email (caller
  routes them to invite flow).
- `PATCH /api/v1/me/workstreams/{ws_id}/members/{user_id}`
  Body: `{role}`. Manage capability required. Cannot change `owner` row
  (ownership transfer is out of scope for 3a).
- `DELETE /api/v1/me/workstreams/{ws_id}/members/{user_id}`
  Manage capability, or self-removal (any user can leave).
- `DELETE /api/v1/me/workstream_memberships/me?workstream_id=...`
  Convenience for "leave workstream."

New file: `backend/app/routers/workstream_invites.py`

- `POST /api/v1/me/workstreams/{ws_id}/invites`
  Body: `{email?, role, intended_account_type, expires_in_days=14}`.
  Manage required. Mints token, returns `{invite_id, token, share_url}`.
  `share_url` = `${FRONTEND_BASE_URL}/invite/${token}`.
- `GET /api/v1/me/workstreams/{ws_id}/invites` → list active (not consumed,
  not revoked, not expired).
- `DELETE /api/v1/me/workstreams/{ws_id}/invites/{invite_id}` → set
  `revoked_at = now()`. Manage required.
- `GET /api/v1/invites/{token}` (unauthed) → returns workstream preview
  `{workstream_name, inviter_display_name, intended_role, intended_account_type}`
  or 404. Caches lookup; rate-limited.
- `POST /api/v1/invites/{token}/accept` (authed) → consumes token, upserts
  `workstream_members` row. Idempotent. If `intended_account_type=guest`
  and current user is `paid`, log a warning but accept (signup flow
  enforces tier; existing paid user accepting a guest invite is a no-op
  on tier).

Models: `backend/app/models/workstream_collab.py`

- `WorkstreamMember`, `WorkstreamMemberCreate`, `WorkstreamMemberUpdate`
- `WorkstreamInvite`, `WorkstreamInviteCreate`, `WorkstreamInviteCreateResponse`
- `WorkstreamInvitePreview`
- Re-export each from `models/__init__.py`.

Touch existing files:

- `backend/app/routers/workstreams.py`
  - `get_user_workstreams`: union owned (`workstreams.user_id = me`)
    with shared (`workstream_members.user_id = me`). Add `role` field on
    each row in the response.
  - `update_workstream`, `delete_workstream`: switch to
    `require_workstream_access(..., capability="manage")`.
- `backend/app/routers/workstream_kanban.py`: every mutation endpoint
  switches to `capability="edit"`. Reads stay `capability="read"`.
- `backend/app/routers/research.py`, `briefs.py`, `card_subresources.py`,
  `workstream_scans.py`: any workstream-scoped paid action becomes
  `require_paid_user(user)` + `require_workstream_access(..., capability="edit")`.
  Audit grep for `workstream_id` parameters and verify each one routes
  through the helper.
- `backend/app/main.py`: `application.include_router(workstream_members.router)`,
  `application.include_router(workstream_invites.router)`.

### Frontend

New hook: `frontend/foresight-frontend/src/hooks/useCapabilities.ts`

```
useCapabilities() → {
  accountType: 'paid' | 'guest',
  canCreateWorkstream: boolean,
  canRunResearch: boolean,
  canExport: boolean,
  forWorkstream(ws) → {
    role: 'owner'|'editor'|'commenter'|'viewer'|'org_viewer'|null,
    canRead, canComment, canEditBoard, canManage,
  }
}
```

Reads from `useAuthContext` profile (must include `account_type`) and
takes the workstream's `role` field returned by the API.

New API client: `frontend/foresight-frontend/src/lib/collaboration-api.ts`

- `listMembers`, `addMember`, `updateMemberRole`, `removeMember`, `leaveWorkstream`
- `createInvite`, `listInvites`, `revokeInvite`, `previewInvite`, `acceptInvite`

New components: `frontend/foresight-frontend/src/components/collaboration/`

- `ShareWorkstreamModal.tsx` — two tabs: "Invite by email" + "Get shareable link."
  Role picker, account-type picker (paid vs guest, hidden until 3c).
- `MembersDrawer.tsx` — list + role change + remove.
- `RoleBadge.tsx` — small chip for owner/editor/commenter/viewer/guest.

Touch existing files:

- `pages/Workstreams.tsx` — split list into "My workstreams" / "Shared
  with me" / "Org." Per-row overflow menu adds Share / Members / Leave.
- `pages/WorkstreamKanban.tsx` — header gets "Share" button + members
  link. Wrap every action button in a `useCapabilities` check; hide where
  capability missing.
- `components/kanban/CardActions.tsx`,
  `components/kanban/SelectionToolbar.tsx` — `canEditBoard` /
  `canRunResearch` / `canExport` gates around action buttons.
- `App.tsx` — register `/invite/:token` route → new
  `pages/InviteAccept.tsx` (authenticated; if not signed in, redirect to
  login with `?redirect=/invite/<token>`).

### Tests

Backend (pytest):

- `tests/test_workstream_members.py`
  - owner adds editor → editor can patch kanban, cannot manage members
  - owner adds commenter → 403 on kanban mutation, can read
  - viewer 403s on comment endpoints (when 3b ships)
  - non-member 404 on workstream
  - removed member loses access immediately
- `tests/test_workstream_invites.py`
  - mint → preview unauthed → accept authed → membership row exists
  - expired token → 410
  - revoked token → 410
  - second accept → idempotent
  - non-owner mint → 403

Frontend (vitest):

- `useCapabilities` returns expected matrix for each role.
- `ShareWorkstreamModal` hides guest tab until `ENABLE_GUEST_ACCOUNTS` flag.
- Integration test: editor sees kanban actions, commenter doesn't.

### Rollout

- Land migration to all environments first.
- Ship endpoints behind `FORESIGHT_ENABLE_COLLABORATION=false` everywhere;
  flip to `true` in dev/staging.
- Frontend route + nav items only render when flag is on (read from
  `/api/v1/health` config blob or a small `/api/v1/config` endpoint).

## Phase 3b — Comments + Activity Feed

**Goal.** Members with `comment` capability can post markdown comments on
cards, signals, portfolios, briefs. An activity feed shows what's
happening in a workstream.

**Acceptance.**

- Comment thread renders under each supported target with chronological replies.
- Author can edit (15-min window) and delete; deleted leaves placeholder.
- Owner can moderate.
- @mentions render as styled tokens (notification fan-out is 3d).
- Reactions (`👍 🎯 🚩 ✅ ❓`) toggle per user per comment.
- Activity rail in WorkstreamKanban lists last N events with filter chips.

### Data

Migration: `<ts>_comments_and_activity.sql`

```sql
CREATE TABLE public.comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type TEXT NOT NULL CHECK (target_type IN ('card','workstream','portfolio','brief')),
    target_id UUID NOT NULL,
    workstream_id UUID REFERENCES public.workstreams(id) ON DELETE CASCADE,  -- scoping for cards
    parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,         -- threading (1-deep ok)
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    body_markdown TEXT NOT NULL,
    body_html TEXT,                    -- server-rendered, sanitized
    mentions UUID[] DEFAULT '{}',      -- referenced auth.users.id
    resolved_at TIMESTAMPTZ,
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_target ON public.comments (target_type, target_id, created_at);
CREATE INDEX idx_comments_workstream ON public.comments (workstream_id, created_at);
CREATE INDEX idx_comments_author ON public.comments (author_id);

CREATE TABLE public.comment_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL CHECK (emoji IN ('👍','🎯','🚩','✅','❓')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (comment_id, user_id, emoji)
);

CREATE TABLE public.workstream_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workstream_id UUID NOT NULL REFERENCES public.workstreams(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,             -- e.g. 'card.moved', 'comment.added', 'member.added'
    target_type TEXT,
    target_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_workstream_activity_ws_created ON public.workstream_activity (workstream_id, created_at DESC);
CREATE INDEX idx_workstream_activity_actor ON public.workstream_activity (actor_id, created_at DESC);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workstream_activity ENABLE ROW LEVEL SECURITY;
-- Service role only; reads happen through backend with capability checks.
-- Add per-table service-role policies (omitted for brevity).
```

### Backend

New router: `backend/app/routers/comments.py`

- `GET /api/v1/comments?target_type=...&target_id=...`
- `POST /api/v1/comments` body `{target_type, target_id, body_markdown, parent_id?}`
- `PATCH /api/v1/comments/{id}` body `{body_markdown, resolved?}`
- `DELETE /api/v1/comments/{id}`
- `POST /api/v1/comments/{id}/reactions` body `{emoji}` (toggle)

New service: `backend/app/comment_service.py`

- Markdown → sanitized HTML (use `markdown` + `bleach`, allowlist
  `p, a, code, pre, strong, em, ul, ol, li, blockquote`).
- Mention extraction (`@uuid` or `@email` post-resolution against members).
- Comment authorization: requires `comment` capability on the workstream
  (cards/portfolios/briefs inherit their workstream's capability;
  standalone signal-card comments require any authed paid user).

New router: `backend/app/routers/workstream_activity.py`

- `GET /api/v1/me/workstreams/{ws_id}/activity?limit=50&cursor=...`

Activity emission helper: `backend/app/activity_log.py`

- `record(workstream_id, actor_id, action, target_type, target_id, metadata)`
- Called from kanban move handlers, research task creation, comment post,
  member add/remove, role change.

Touch existing files:

- `backend/app/routers/workstream_kanban.py`: add `activity_log.record(...)`
  inside every mutation handler. Be careful with bulk actions — emit one
  event per affected card.
- `backend/app/routers/research.py`: emit `'research.queued'` event.
- `backend/app/routers/briefs.py`: emit `'brief.generated'` event.

### Frontend

New components: `frontend/foresight-frontend/src/components/comments/`

- `CommentThread.tsx` — list, paginate, mention render, reactions.
- `CommentEditor.tsx` — markdown textarea with @mention autocomplete.
- `CommentItem.tsx`.

New components: `frontend/foresight-frontend/src/components/activity/`

- `ActivityRail.tsx` — opens from kanban header; filter chips.
- `ActivityItem.tsx` — typed renderer per `action`.

New API client: `frontend/foresight-frontend/src/lib/comments-api.ts` and
`activity-api.ts`.

Touch:

- Card detail drawer in WorkstreamKanban → comments tab.
- `pages/CardDetail` (signal page) → comments section.
- `pages/PortfolioDetail.tsx` → comments section.
- Brief detail view → comments section.
- WorkstreamKanban header → "Activity" toggle.

### Tests

- Backend: comment lifecycle, edit window, mention extraction,
  authorization (commenter can post, viewer cannot, removed member's
  past comments stay).
- Frontend: thread renders, mention autocomplete picks from members,
  reaction toggle.

### Rollout

Same flag-gated approach. Comments table reads return empty when flag is
off so the rail can ship before content does.

## Phase 3c — Guest Accounts + Invite-Link Signup

**Goal.** Sally can mint a guest invite. Dana, who has never used
Foresight, opens the link, signs up, and lands in a stripped-down app
with just-enough permission to read shared workstreams and comment.

**Acceptance.**

- Guest signup flow attaches the new profile with `account_type='guest'`.
- Guest cannot create workstreams, run research, or trigger any paid
  action via API (403) or UI (button hidden).
- Guest can browse Discover, signal pages, comment on signals, and read
  any workstream they've been added to.
- Admin can upgrade guest → paid in `/admin`.

### Data

No new tables. The pre-phase migration already adds
`profiles.account_type`. This phase wires logic.

### Backend

Touch:

- `backend/app/authz.py`: `require_paid_user` already exists from
  pre-phase. Confirm every paid endpoint uses it. Audit list lives in
  this doc's appendix.
- `backend/app/routers/workstream_invites.py` (3a router): when accepting
  a guest invite during a fresh signup flow, ensure new profile inserted
  with `account_type='guest'`. The Supabase auth signup hook needs to
  read the invite token from session metadata and set the column.
  - Implementation: a server-side `POST /api/v1/auth/complete-signup`
    endpoint that the frontend calls after Supabase signup, taking
    `{invite_token}`. It verifies the token, inserts/updates the profile
    row with `account_type=intended_account_type`, then accepts the
    invite. This avoids needing a Supabase auth hook function.
- `backend/app/routers/admin.py`: new endpoints
  - `POST /api/v1/admin/users/{user_id}/account_type` body `{account_type}`
  - `GET /api/v1/admin/users/guests` → list with last-seen, inviter,
    workstreams attached.

### Frontend

New pages:

- `pages/InviteAccept.tsx` (route `/invite/:token`) — public, calls
  `previewInvite`. If unauthed: button "Sign up to view." If authed:
  button "Accept invitation."
- `pages/GuestSignup.tsx` (or extend the existing signup) — pre-fills
  email from invite preview, branding emphasizes "you're signing up to
  view Sally's workstream." On submit → Supabase signup → call
  `complete-signup` with token → redirect to workstream.

Guest mode shell:

- New `components/layout/GuestBanner.tsx` — persistent top banner.
- `components/Header.tsx` — adds account-type pill ("Guest" badge).
- `components/Sidebar` (wherever the nav lives in `App.tsx`) — hide
  "New Workstream," "Settings → Admin," anything that runs research.
  Drive everything from `useCapabilities().canCreateWorkstream` etc.
- `App.tsx` — wrap protected routes with a `GuestRouteGuard` that
  redirects guests away from create/admin routes.

Touch:

- Every page that exposes a "Create / Run / Export" button: wrap in
  `canCreateWorkstream` / `canRunResearch` / `canExport`. Audit list:
  - `pages/Workstreams.tsx` — "New Workstream" button
  - `pages/WorkstreamKanban.tsx` — bulk actions, run-research, export
  - `pages/PortfolioDetail.tsx` — export, regenerate
  - `pages/Discover.tsx` — auto-research toggle, queue actions
  - `pages/Signals/...` — any "Run deep research" button
  - `components/kanban/CardActions.tsx`,
    `components/kanban/SelectionToolbar.tsx`

### Tests

- Backend: guest profile cannot POST to research/briefs/portfolios/admin.
  Guest can GET cards/signals/comments. Admin can flip account_type.
- Frontend: render guest mode, verify all action buttons absent.
  Snapshot test of nav for `paid` vs `guest`.

### Rollout

Flip `FORESIGHT_ENABLE_GUEST_ACCOUNTS=true` in dev → staging → prod.
Keep `paid` as default; existing users untouched.

## Phase 3d — Notifications

**Goal.** In-app notification bell with unread count. Optional daily
email digest. Per-workstream mute.

**Acceptance.**

- @mentions, comment replies, role changes, workstream-add events
  produce notifications.
- Bell shows unread count; click → list; mark all read.
- User can mute notifications for a specific workstream.
- Daily digest sent at user's preferred hour (UTC for v1) with batched
  events.

### Data

Migration: `<ts>_notifications.sql`

```sql
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,                 -- 'mention','reply','member_added','role_changed','workstream_comment'
    workstream_id UUID REFERENCES public.workstreams(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    target_type TEXT,
    target_id UUID,
    payload JSONB NOT NULL DEFAULT '{}',
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON public.notifications (user_id, read_at, created_at DESC);

CREATE TABLE public.notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    digest_enabled BOOLEAN NOT NULL DEFAULT true,
    digest_hour_utc INTEGER NOT NULL DEFAULT 13,
    muted_workstream_ids UUID[] NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
-- Users can read own; service role manages.
```

### Backend

New service: `backend/app/notification_service.py`

- `notify(user_id, kind, ...)` — inserts row, respects mutes, dedups
  mentions within 30 min per (user, workstream).
- Subscribes to comment-add and member-add via direct call from those
  routers (don't try to do this with DB triggers in v1).

New router: `backend/app/routers/notifications.py` (file already exists
as a stub — extend, don't recreate).

- `GET /api/v1/me/notifications?cursor=...&unread_only=...`
- `POST /api/v1/me/notifications/mark-read` body `{ids?}` (all if absent)
- `GET /api/v1/me/notifications/preferences`
- `PUT /api/v1/me/notifications/preferences`

Worker job: digest emitter

- New scheduler entry in `backend/app/scheduler.py` running hourly,
  selects users whose `digest_hour_utc == current_hour_utc` and have
  unread events since last digest. Sends via Supabase auth's email
  template or the chosen transactional provider.

### Frontend

- `components/Header.tsx` — bell icon, dropdown with last 10 events.
- `pages/Notifications.tsx` (route `/notifications`) — full history.
- `pages/Settings/NotificationPreferences.tsx`.
- `lib/notifications-api.ts`.

### Tests

- Backend: dedup window, mute respected, digest selection by hour.
- Frontend: bell unread count, mark-read flow, preference round-trip.

## Phase 3e — Realtime Kanban + Presence

**Goal.** Sally and Marcus see each other's avatars in the kanban header
and watch each other's card moves with a small toast and animated
transition.

**Acceptance.**

- Kanban subscribes to Supabase Realtime on `workstream_cards` filtered
  by workstream id; card moves from other users update the local board
  within 2s without page reload.
- Header shows an avatar stack of currently-active members (heartbeat
  ≤ 30s).
- Toast appears on remote moves: "Marcus moved 'Card title' to Working."
- Optimistic updates for the actor; reconciliation if Realtime echo
  conflicts.

### Data

Migration: `<ts>_workstream_presence.sql`

```sql
CREATE TABLE public.workstream_presence (
    workstream_id UUID NOT NULL REFERENCES public.workstreams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workstream_id, user_id)
);
CREATE INDEX idx_workstream_presence_recent ON public.workstream_presence (workstream_id, last_seen_at DESC);

ALTER TABLE public.workstream_presence ENABLE ROW LEVEL SECURITY;
-- Members can SELECT presence rows for their workstreams.
```

Alternative: use Supabase Realtime's built-in **presence channel** and
skip the table entirely. Pick one. Recommendation: presence channel for
v1 (simpler), table only if we later need historical "last seen" stats.

### Backend

- `backend/app/routers/workstream_presence.py` (only if using table):
  - `POST /api/v1/me/workstreams/{ws_id}/presence/heartbeat`
  - `GET /api/v1/me/workstreams/{ws_id}/presence`
- Enable Supabase Realtime publication on `workstream_cards` and
  `comments` for workstreams the user is a member of (RLS handles auth).

### Frontend

New hook: `hooks/useWorkstreamRealtime.ts`

- Subscribes to `workstream_cards` Realtime channel.
- Manages presence channel join/leave.
- Returns `{presentMembers, applyRemoteCardChange}`.

Touch:

- `pages/WorkstreamKanban.tsx` — wire the hook, render avatar stack,
  apply remote changes to local state, fire toasts.
- `components/kanban/PresenceStack.tsx` (new) — overlapping avatars.

### Tests

- Manual / Playwright e2e: open two browser sessions as different
  members, verify card move propagates.
- Conflict test: two simultaneous moves on the same card — last-write
  wins, both clients converge.

### Rollout

Flag-gated (`FORESIGHT_ENABLE_REALTIME=false` initial). Concern: Supabase
Realtime cost scales with concurrent subscribers — measure during
staging.

## Phase 3f — Open-Link Sharing + Public Viewer

**Goal.** Sally can mint a public, watermarked, read-only link for a
single portfolio / brief / signal. No login required to view; no
interactivity beyond reading.

**Acceptance.**

- "Share publicly" toggle on portfolio/brief/signal generates a token.
- `/share/:token` route renders a watermark-stamped read-only view.
- Revoking the link 404s the URL immediately.
- Owner sees view counts and last-viewed-at on each link.

### Data

Migration: `<ts>_share_links.sql`

```sql
CREATE TABLE public.share_links (
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
CREATE INDEX idx_share_links_target ON public.share_links (target_type, target_id);
CREATE INDEX idx_share_links_token ON public.share_links (token);
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;
-- Owners SELECT own; service role manages; public reads via backend.
```

### Backend

New router: `backend/app/routers/share_links.py`

- `POST /api/v1/me/share-links` body `{target_type, target_id, expires_in_days?}`
- `GET /api/v1/me/share-links?target_type=...&target_id=...`
- `DELETE /api/v1/me/share-links/{id}`
- `GET /api/v1/public/share/{token}` (unauthed, rate-limited) — returns
  read-only payload: portfolio cards / brief markdown / signal summary.
  Increments `view_count`, sets `last_viewed_at`. Emits an event for
  owner notification (optional).

Capability: only the workstream `owner` can mint share links for
workstream-attached artifacts; `manage` cap for standalone portfolios.

### Frontend

New components:

- `pages/PublicShareViewer.tsx` (route `/share/:token`, **no auth**) —
  renders the relevant target type. Watermark overlay.
- `components/ShareLinkPanel.tsx` — toggle + URL + revoke + view count.

Touch:

- `pages/PortfolioDetail.tsx`, brief detail, `pages/CardDetail` — add
  Share menu with public-link option.
- `App.tsx` — register `/share/:token` outside `ProtectedRoute`.

### Tests

- Backend: token preview, revoke 404, view count increment, expired
  token 410.
- Frontend: public route renders without auth, watermark visible, no
  action buttons.

## Cross-Phase Concerns

### Cost telemetry tagging

Touch `backend/app/usage_telemetry.py`: every recorded usage event must
include `workstream_id` and `actor_role` when the operation runs in a
workstream context. Update `llm_usage_events` admin summary to break
down cost per workstream, per role.

Verification: after one full Sally-and-Dana session,
`/api/v1/admin/usage/summary?group_by=account_type` should show
`guest: $0.00`.

### Audit log

Membership/invite/role mutations write to `workstream_activity` (3b
covers this) **and** to a tamper-evident admin audit table:

Migration in 3a: `audit_collaboration_events` (action, actor_id,
target_type, target_id, before, after, created_at). Append-only;
admin-readable.

### RLS sanity check

Each migration includes `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and
explicit policies. The pattern:

- Service role: full access.
- Authenticated users: SELECT-only against their own scoped data
  (own `user_id`, or membership-derived).
- No INSERT/UPDATE/DELETE policies on authenticated; all writes go
  through backend.

Backend always uses the service-role client (`supabase` in `deps.py`)
and enforces application-level authz. RLS is defense-in-depth.

### Email transport

For invite emails specifically, prefer Supabase's built-in magic-link
email so we don't add a third-party dependency until we need branded
HTML. Comment-mention emails and digests can wait until 3d ships and we
have measured volume.

### Frontend session config endpoint

To keep flags consistent client-side, add
`GET /api/v1/config` returning `{collaboration_enabled, guest_accounts,
realtime, public_share}`. Frontend reads at app boot and gates routes

- menu items off the response. Cached for the session.

## Phase Dependencies

```
pre-phase --> 3a --> 3b --> 3c
                \-> 3d (depends on 3b for comment events)
                \-> 3e (depends on 3a for membership; otherwise independent)
                \-> 3f (depends on 3a for owner concept)
```

3b and 3c can ship in either order after 3a. 3d depends on 3b having
emitted comment-add events.

## Effort Sketch

Rough order-of-magnitude only. Assumes one engineer, no surprises.

| Phase | Backend | Frontend | Total |
| ----- | ------- | -------- | ----- |
| pre   | 0.5d    | 0.5d     | 1d    |
| 3a    | 2-3d    | 3-4d     | 5-7d  |
| 3b    | 3-4d    | 3-4d     | 6-8d  |
| 3c    | 1-2d    | 3-4d     | 4-6d  |
| 3d    | 2-3d    | 2d       | 4-5d  |
| 3e    | 1-2d    | 3-4d     | 4-6d  |
| 3f    | 1-2d    | 2-3d     | 3-5d  |

## Open Decisions Needed Before 3a Starts

These have to be settled because they affect the data model and surface
that lands in 3a.

1. **Ownership transfer.** Out of scope for 3a per this doc. Confirm.
   If we want it in 3a, add a `POST /members/transfer-ownership`
   endpoint and a "Transfer" button on the manage row.
2. **"Org workstream" interaction with members.** Today org workstreams
   are read-for-all. Should they also support explicit
   member-with-edit? Recommendation: yes — an org workstream owner can
   add specific paid users as `editor` to allow contribution while
   keeping the broad read access.
3. **Self-removal semantics.** When the last `owner` tries to leave,
   block with "Transfer ownership first" or auto-promote oldest
   editor? Recommendation: block.
4. **Email lookup privacy.** When Sally types `bob@example.com`, do we
   say "no such user" if Bob has no profile, or always return success
   with "we'll email Bob if he signs up"? Recommendation: differentiate
   — known user becomes a direct membership, unknown email becomes a
   sent-invite (token in URL, hand-off through 3c flow). This is the
   bridge between 3a and 3c.

## Audit Checklist for Paid-Action Endpoints

Reviewed in 3c, but listed here so 3a knows what 3c will touch. Every
endpoint in this list must end up calling
`require_paid_user(user)` once 3c lands:

- `POST /api/v1/me/workstreams` (create)
- `POST /api/v1/me/research-tasks` (any kind)
- `POST /api/v1/me/workstreams/{id}/auto-scan`
- `POST /api/v1/me/workstreams/{id}/scans`
- `POST /api/v1/briefs/...` (generate)
- `POST /api/v1/portfolios` (create)
- `POST /api/v1/portfolios/{id}/export`
- `POST /api/v1/me/workstreams/{id}/bulk-brief-export`
- `POST /api/v1/cards/{id}/export-pdf`
- Anything under `/api/v1/admin/...` (already admin-gated; account-type
  check is redundant but cheap).

Generate this list mechanically with:

```
rg "@router\.(post|put|patch|delete)" backend/app/routers/ -A 2
```

then triage.
