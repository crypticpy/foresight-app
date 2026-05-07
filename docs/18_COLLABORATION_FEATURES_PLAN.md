# Collaboration Features Plan

> Companion to `17_PILOT_SECURITY_COST_COLLABORATION_PLAN.md`. That doc set up
> the **authz scaffolding** and member-role primitives for Phase 3. This doc
> goes deep on the **product surface** of collaboration: invitation flows,
> account types, comments, presence, notifications, and the specific UI
> touchpoints that need to change.

## TL;DR

Foresight needs three collaboration tiers, not two:

1. **Owner / paid collaborator** — full account, can spend money, can be
   invited to others' workstreams as `editor`/`commenter`/`viewer`.
2. **Guest viewer** — restricted account created via a shared invite link.
   Can browse signals and read shared workstreams. Cannot create workstreams,
   cannot trigger research, cannot export, cannot edit.
3. **Anonymous public reader** — _(optional, defer)_ opens a tokenised
   read-only link to a single signal/portfolio/brief without signing up.

The existing `workstream_members` model handles tier 1 cleanly. Tier 2 is the
new work: a `profiles.account_type` flag (`paid` | `guest`) plus
account-level capability gating in both backend (`authz.py`) and frontend
(nav, action buttons, page guards).

On top of the access tiers, the workstream itself needs the collaboration
primitives that make a multi-person experience worth doing:

- Comments on cards, signals, portfolios, briefs
- Member management UI (list, add, change role, remove)
- Activity feed per workstream
- Real-time presence + live kanban updates
- Notifications (in-app bell + optional email digest)
- "Shared with me" view in the workstream list

## Personas

- **Sally — Owner / paid user.** Created several workstreams, wants feedback
  from a colleague and from an external SME. Doesn't want to grant the
  external SME the ability to spend research budget.
- **Marcus — Internal collaborator (paid).** Same kind of account as Sally.
  Sally invites him as an `editor` so he can move kanban cards and queue
  research on her workstream. They want to see each other's edits live.
- **Dana — External SME / guest.** Receives a magic link from Sally, signs
  up with her Austin-area email, lands in a stripped-down version of the app.
  Can read every signal Foresight surfaces, can read Sally's shared
  workstream and comment on cards, cannot create anything new and cannot
  trigger paid actions.
- **Chen — Admin / staff.** Sees usage costs, can flip account types, can
  resolve invite issues.

## Account Types

`profiles.account_type` (new column, defaults `paid` for existing users):

| Type    | Create workstreams | Trigger research | Export PDF/PPTX | Comment | Read open signals | Read shared workstreams |
| ------- | ------------------ | ---------------- | --------------- | ------- | ----------------- | ----------------------- |
| `paid`  | ✓                  | ✓                | ✓               | ✓       | ✓                 | ✓ (per-membership role) |
| `guest` | ✗                  | ✗                | ✗               | ✓       | ✓                 | ✓ (read-only)           |

`guest` is an account-level constraint applied **before** workstream-level
role checks. Even if a guest were granted `editor` membership by accident,
the account-level cap would still block paid actions and creation. The same
gate must exist on the frontend — every button that initiates a paid or
mutating action must hide for `guest`.

Existing `profiles.role` (`user`/`admin`/`service_role`) is orthogonal and
stays.

## Sharing Units

Each of these can be shared independently. Most of the work clusters around
workstream sharing; the others are simpler "anyone with the link can read."

| Unit          | Default sharing  | Comments? | Member roles  | Real-time |
| ------------- | ---------------- | --------- | ------------- | --------- |
| Workstream    | private to owner | yes       | yes (4 roles) | yes       |
| Card / signal | open to authed   | yes       | n/a           | no        |
| Portfolio     | private to owner | yes       | inherited     | no        |
| Brief         | private to owner | yes       | inherited     | no        |
| Deep research | private to owner | no (v1)   | inherited     | no        |

Inheritance: a portfolio/brief/deep-research artifact owned by a workstream
inherits that workstream's membership. Standalone artifacts (e.g. a
cross-workstream portfolio) get their own member list, mirrored from the
workstream model.

## Sharing Mechanisms

Three flavours, all funneling into the same `workstream_members` table:

1. **Invite an existing Foresight user.** Sally types an email, the system
   matches a profile, the member row is created with the chosen role. Marcus
   sees the workstream appear in his "Shared with me" list and gets a
   notification.
2. **Invite a new user via guest link.** Sally clicks "Share as guest viewer."
   System mints a one-time invite token. She sends it (email or copy link).
   Recipient signs up; signup flow detects the token, creates a `guest`
   profile, attaches them to the workstream as `viewer`/`commenter` (Sally's
   choice). Token is consumed.
3. **Open link** _(optional, scoped to portfolios/briefs/single signals)._
   Anyone with the URL can read a tokenised, watermarked copy. No account.
   Useful for sharing with the public or with mayoral staff who won't sign
   up. Can be disabled per-tenant.

## Permission Model

Already implemented in `backend/app/authz.py`:

```
owner:     (read, edit, manage) = (✓, ✓, ✓)
editor:    (read, edit, manage) = (✓, ✓, ✗)
commenter: (read, edit, manage) = (✓, ✗, ✗)
viewer:    (read, edit, manage) = (✓, ✗, ✗)
```

Refinement we need: split `edit` into `edit_board` and `comment` so
`commenter` is a distinct capability from `viewer`. Today both have
`can_edit=False`, which means commenter can't actually post comments. Either
add a `can_comment` field to `WorkstreamAccess` or treat comments as their
own capability bucket.

Account-level gate (new): every paid action also checks
`profile.account_type == 'paid'`. Guests fail this regardless of their
workstream role.

## User Stories

Grouped by the journey that motivates the feature.

### A. Sally invites Marcus (paid → paid full collaboration)

A1. _As Sally, I want to invite Marcus to my "Mobility" workstream as an
editor so he can move kanban cards and queue research alongside me._

A2. _As Sally, I want to see Marcus's avatar appear in the workstream
header when he's viewing the same kanban board so I know he's here._

A3. _As Marcus, I want kanban changes from Sally to appear in my view
within a couple of seconds without a page refresh._

A4. _As Marcus, I want to leave a comment on a card asking Sally a
question, and have her see a notification next time she opens the app._

A5. _As Sally, I want to @mention Marcus in a comment to ping him
specifically, even if he isn't actively viewing the board._

A6. _As Sally, I want to change Marcus's role from `editor` to `commenter`
without removing him, in case the project shifts to review-only._

A7. _As Sally, I want to remove Marcus from the workstream when his
involvement ends, and have his comments stay (attributed) but his access
revoked._

A8. _As Sally, I want to see an activity feed showing who moved which card
when, who ran which research task, who added which comment._

A9. _As Marcus, I want the workstream to appear in my "Shared with me"
section in the workstreams list, visually distinct from my own._

A10. _As Sally, I want a "you have unread comments" badge on the workstream
card so I know which collaborators have left feedback since my last visit._

### B. Sally invites Dana (paid → guest read-only)

B1. _As Sally, I want to share my workstream with Dana, an external expert,
without giving her the ability to spend our research budget._

B2. _As Sally, I want to send Dana a one-click magic link that walks her
through signup as a guest viewer, without me having to explain anything._

B3. _As Dana, when I click the magic link, I want to see "Sally invited
you to view the Mobility workstream" so I know what I'm signing up for._

B4. _As Dana, after signing up, I want to land directly on the shared
workstream, not on a generic dashboard._

B5. _As Dana, I want to be able to comment on cards and reply to Sally's
threads, but I should never see a "Run Deep Research" or "Export" button._

B6. _As Dana, I want to browse the public signal feed (Discover, signal
detail pages) so I can contribute context Sally might have missed._

B7. _As Dana, I should not be able to create my own workstream, run my own
research, or trigger any paid action — those entry points should not exist
in my UI._

B8. _As Sally, I want a clear visual indicator on Dana's avatar/comments
showing she's a guest, so I'm not surprised by what she can see._

B9. _As an admin, I want to be able to upgrade Dana from `guest` to `paid`
if her engagement scope grows._

B10. _As Sally, I want to revoke Dana's invite link before she's used it,
in case I sent it to the wrong address._

### C. Cross-workstream / portfolio sharing

C1. _As Sally, I want to share a single portfolio (e.g. "Top 10 EV
infrastructure signals") with the mayor's chief of staff via an open link,
without granting access to the underlying workstreams._

C2. _As Sally, I want to share an executive brief with a council member as
a read-only link with no comments enabled._

C3. _As Sally, I want to share a single signal/card publicly with a
journalist, with a clear "Foresight – City of Austin" watermark._

C4. _As Sally, I want to revoke a share link and have it 404 immediately
for anyone who held it._

C5. _As Sally, I want to see a list of every active share link I've
created, who's viewed it, and when, so I can audit external exposure._

### D. Comments and discussion

D1. _As any member with `comment` capability, I want to add a comment to a
card with markdown formatting (bold, links)._

D2. _As any reader, I want to see a comment thread under each card with
chronological replies._

D3. _As a commenter, I want to edit my own comment within 15 minutes of
posting and see "(edited)" afterwards._

D4. _As a commenter, I want to delete my own comment, leaving a "comment
removed" placeholder so the thread structure stays._

D5. _As an owner, I want to delete any comment in my workstream
(moderation)._

D6. _As any reader, I want to react with 👍 / 🎯 / 🚩 to a comment without
typing a reply._

D7. _As any reader, I want to filter the activity feed to comments only,
or to my own activity only._

D8. _As a member, I want @mentions to autocomplete from the workstream
member list so I don't have to remember exact usernames._

D9. _As a reader, I want a "resolved" toggle on a comment thread so we can
mark questions as answered without deleting the thread._

### E. Notifications

E1. _As any user, I want a notification bell in the header that shows
unread events._

E2. _As any user, I want notifications when I'm @mentioned, when someone
replies to my comment, when I'm added to a workstream, when my role
changes, and when a workstream I own gets a new comment._

E3. _As any user, I want an optional daily digest email summarising
notifications, configurable from settings._

E4. _As any user, I want to mark all notifications read with one click._

E5. _As any user, I want to silence notifications for a specific
workstream without leaving it._

### F. Discoverability and onboarding

F1. _As a new guest user, I want a 3-screen onboarding that explains:
"You're here as a guest. You can read and comment. To run research, ask
your inviter to upgrade your account."_

F2. _As a paid user, I want a "Shared with me" section in the workstreams
list, separated from "My workstreams" and "Org workstreams," with a count
badge._

F3. _As a paid user, I want to leave a workstream someone else owns, in
case I no longer need access._

F4. _As an admin, I want a /admin/collaboration view showing every active
membership, every active invite, and every guest account with last-seen
date._

## Feature Inventory

Mapped to user stories above.

### Backend

- **`profiles.account_type` column** (`paid` | `guest`, default `paid`).
  Migration + backfill. → A, B, C
- **Account-type gate in `authz.py`** — new helper
  `require_paid_user(user)` called from every research/export/create
  endpoint. → B5, B7
- **`workstream_invites` table** — `id`, `workstream_id`, `email`,
  `intended_role`, `intended_account_type`, `token`, `created_by`,
  `expires_at`, `consumed_at`. → A1, B2, B10
- **Invite endpoints**:
  - `POST /api/v1/me/workstreams/{id}/invites` → mint token, returns link
  - `GET /api/v1/invites/{token}` (unauthed) → preview workstream metadata
  - `POST /api/v1/invites/{token}/accept` (authed) → consume token, attach
    member
  - `DELETE /api/v1/me/workstreams/{id}/invites/{invite_id}` → revoke
    → A1, B2, B3, B10
- **Member management endpoints**:
  - `GET /api/v1/me/workstreams/{id}/members`
  - `POST /api/v1/me/workstreams/{id}/members` (existing user lookup)
  - `PATCH /api/v1/me/workstreams/{id}/members/{user_id}` (role change)
  - `DELETE /api/v1/me/workstreams/{id}/members/{user_id}`
  - `DELETE /api/v1/me/workstream_memberships/me` (leave a workstream)
    → A1, A6, A7, F3
- **Comments table + endpoints** — `comments` polymorphic on
  `target_type` (`card`, `workstream`, `portfolio`, `brief`) and
  `target_id`. Endpoints under each parent route. Reactions table.
  Mentions extracted on write. → D1–D9
- **Activity events table** — append-only `workstream_activity` rows
  (`actor_id`, `action`, `target_type`, `target_id`, `metadata`,
  `created_at`). Emit from kanban move, research queue, comment add, role
  change, member add/remove. → A8, D7
- **Notifications table** — `notifications` (`user_id`, `kind`,
  `payload`, `read_at`). Worker fans out from activity events. → E1–E5
- **Open-link share endpoints** — `share_links` table with
  `target_type`/`target_id`/`token`/`expires_at`/`created_by`. Public read
  endpoints under `/api/v1/public/share/{token}`. → C1–C5
- **Realtime channel mapping** — Supabase Realtime on
  `workstream_cards`, `comments`, `workstream_presence` filtered by
  workstream id. → A2, A3
- **Presence** — ephemeral `workstream_presence` rows (or Supabase
  Realtime presence channel) keyed by `(workstream_id, user_id)`,
  heartbeated by the frontend. → A2

### Frontend

- **Account-type-aware `useCapabilities` hook** — single source for
  `canCreateWorkstream`, `canRunResearch`, `canExport`, `canComment`,
  `canEditBoard`, derived from profile + workstream role. Every action
  button reads from this. → B5, B7
- **Share modal** (workstream) — dual-tab: "Invite by email" /
  "Get shareable link." Role picker. List of current members with
  inline role change + remove. → A1, A6, A7
- **Members panel** — collapsible drawer in workstream header showing
  avatars, roles, last-seen. → A2, B8
- **Comments component** — embedded under cards (kanban detail drawer),
  signals (CardDetail page), portfolios, briefs. Markdown editor with
  @mention autocomplete. → D1–D9
- **Activity feed** — right rail or modal in WorkstreamKanban. Filter
  chips. Click an event → scroll to/highlight target. → A8, D7
- **"Shared with me" section** — in `pages/Workstreams.tsx` and
  `pages/WorkstreamPortfolios.tsx`. → F2
- **Notification bell** — in `components/Header.tsx`. Dropdown with last
  N events. Link out to a `/notifications` page for full history. → E1, E4
- **Notification preferences** — in user settings: per-workstream mute,
  daily digest opt-in. → E3, E5
- **Guest-mode shell** — when `account_type === 'guest'`, the app
  renders a stripped nav (no "New Workstream," no Discover settings, no
  Admin), every paid-action button is hidden via `useCapabilities`, a
  persistent banner reads "You're a guest viewer — ask Sally to upgrade
  for full access." → B5, B7, F1
- **Invite landing page** — `/invite/:token` route. Renders preview
  card, "Sign up to view" CTA, hands off to Supabase signup with token
  forwarded. → B2, B3, B4
- **Open-link viewer** — `/share/:token` for portfolios/briefs/single
  signals. No nav, watermark, no actions. → C1–C3
- **Realtime sync** — kanban cards, comments, presence subscribed via
  Supabase Realtime. Optimistic local updates on the actor side. → A2, A3
- **Avatar overlap stack** — header presence indicator, hover for
  member name + role. → A2

### Cross-cutting

- **Audit log expansion** — every membership/role/invite mutation written
  to `workstream_activity` + admin-visible audit table.
- **Cost telemetry tagging** — every `llm_usage_events` row already has
  `user_id`. Add `workstream_id` + `actor_role` so the admin usage report
  can show "guest accounts cost: $0 (as expected)" and "Marcus's research
  on Sally's workstream cost: $X."
- **Guest abuse caps** — global + per-inviter cap on outstanding guest
  invites and active guest accounts (e.g. 25 per inviter), to prevent
  someone using the invite flow to seed bot accounts.
- **Email transport** — `RESEND_API_KEY` (or Supabase email) for invite
  emails, comment-mention emails, daily digests.

## Workflow Touchpoints (Where Buttons / Actions Land)

This is the explicit "where does the new UI go" inventory.

### `pages/Workstreams.tsx` (workstream list)

- Section split: "My workstreams" / "Shared with me" / "Org" (already
  exists for the last one).
- Per-row: badge for unread comments, presence dot if anyone else is
  currently viewing.
- Per-row overflow menu: "Share," "Manage members," "Leave workstream"
  (when not owner).

### `pages/WorkstreamKanban.tsx`

- Header: avatar stack of currently-present members + "Share" button.
- Header: "Activity" toggle that opens the right rail.
- Header: "Members" link that opens the members drawer.
- Card tile: small avatar of last commenter; unread-comment dot.
- Card detail drawer: comments tab next to "Notes" / "Research."
- Real-time: card moves animate when someone else moves them, with a
  small toast "Marcus moved 'X' to Working."

### `pages/PortfolioDetail.tsx`

- Header: "Share" button (open link or member list, depending on parent).
- Section: comments at the bottom.

### `pages/Brief detail` (existing brief view inside workstream)

- Same as portfolio: share button + comments section.

### `components/CardDetail/...` (signal detail page)

- Always-visible comments section near the bottom (cards are
  org-readable; comments are scoped per-card and visible to anyone with
  read access to the card).
- "Share" menu: copy public open-link / copy authed link.

### `components/Header.tsx`

- Notification bell with unread count.
- Account-type pill next to user avatar ("Guest" badge for guests).

### `components/kanban/CardActions.tsx` & `SelectionToolbar.tsx`

- Hide "Run Research," "Generate Brief," "Export" for users without
  `canRunResearch` / `canExport`.
- Add "Comment" / "Mention" actions to the selection toolbar.

### `pages/Settings/Notifications` (new)

- Notification preferences (digest cadence, per-workstream mute list).

### `pages/Settings/Security` (new or existing)

- "Active sessions" + "Active invites I've sent" + "Workstreams I'm a
  guest on."

### `App.tsx` routes (new)

- `/invite/:token` — invite landing.
- `/share/:token` — open-link viewer.
- `/notifications` — full notifications history.
- `/settings/collaboration` — invite + member management overview.

### Admin (`pages/Admin/...`)

- Collaboration tab: every guest account, last-seen, inviter,
  workstreams attached. Upgrade-to-paid button. Force-revoke invite
  button.

## Open Questions / Decisions Needed

1. **Comments scope.** Are comments on a card visible across every
   workstream that pins that card, or only within the workstream where
   the comment was made? **Recommendation:** workstream-scoped, with a
   future "global comment" type if cross-workstream visibility becomes
   desirable. Pinning the same card in two workstreams should not bleed
   private discussion.
2. **Guest discovery scope.** Can a guest see _every_ signal Foresight
   has surfaced, or only signals reachable from the workstreams they've
   been added to? **Recommendation:** every signal (cards are already
   org-readable for paid users; mirror that for guests). The guest
   constraint is on _spending_ and _creating_, not on _reading_.
3. **Real-time provider.** Supabase Realtime channels (cheap, already
   wired) vs a dedicated Y.js / Liveblocks layer (better for
   document-style collab, more cost). **Recommendation:** Supabase
   Realtime for v1; the kanban is a state machine, not a document.
4. **Email provider for invite + digest.** Resend, Postmark, or
   Supabase's built-in transactional. **Recommendation:** Supabase auth
   handles invite magic links natively — start there and only add a
   transactional provider when we need branded HTML or analytics.
5. **Invite token lifetime.** 7 days? 30? Single-use vs reusable?
   **Recommendation:** single-use, 14-day expiry by default, owner can
   regenerate.
6. **Open-link watermark and analytics.** Required for
   external-facing public links. Lift existing PDF watermark logic into
   the web viewer.
7. **Mention notification dedup.** If Sally @mentions Marcus three times
   in five minutes across two cards, that's one notification or three?
   **Recommendation:** collapse within a 30-minute window per
   workstream.
8. **Notes vs comments migration.** `workstream_cards.notes` already
   exists as a single text field per (workstream, card). Doc 17 flagged
   this. **Recommendation:** keep `notes` as the owner's private
   scratchpad; treat comments as a new shared object. Show a one-time
   migration prompt for owners with existing notes if/when shared
   editors are added.
9. **Resolved comment threads visibility.** Hide by default vs show
   collapsed? **Recommendation:** collapsed but visible, with a
   "show resolved" filter.
10. **Reaction set.** Limit to a fixed set (`👍 🎯 🚩 ✅ ❓`) vs free
    emoji. **Recommendation:** fixed set v1; municipal-strategy use case
    doesn't need 1000 emojis.

## Suggested Phasing

These can all ship in a single feature branch sequence; the phases below
are sized to make each one independently shippable.

**Phase 3a — Member management (paid ↔ paid).**

- `workstream_invites` table + endpoints
- Member endpoints (CRUD)
- Share modal (existing-user-only, no guest path yet)
- "Shared with me" section
- `useCapabilities` hook + button hiding for non-owner roles
- No comments, no realtime, no notifications yet

**Phase 3b — Comments + activity feed.**

- `comments` and `workstream_activity` tables
- Card-detail comments
- Activity rail
- Mentions (string-only, no notification yet)

**Phase 3c — Guest accounts + invite-link signup.**

- `profiles.account_type` column + `require_paid_user` gate
- Invite landing page, signup hand-off
- Guest-mode shell (stripped nav, hidden actions)
- Account-type pill + admin upgrade/downgrade

**Phase 3d — Notifications.**

- `notifications` table
- Header bell + page
- Per-event preferences
- Daily digest worker job (uses existing scheduler)

**Phase 3e — Realtime kanban + presence.**

- Supabase Realtime subscriptions
- Avatar stack
- Live-move toasts

**Phase 3f — Open-link sharing + public viewer.**

- `share_links` table
- `/share/:token` route
- Watermark + revoke UI

After 3a–3c we have functional collaboration. 3d–3f are quality-of-life
upgrades that turn it from "shared workspace" into "actually pleasant to
collaborate in."

## Out of Scope (For Now)

- Granular per-card permissions (e.g. one card visible to viewer X but
  not viewer Y inside the same workstream). The role/membership model
  intentionally keeps the unit-of-sharing at the workstream level.
- Cross-org collaboration (members from different organisations on the
  same workstream). Defer until org accounts are real.
- Inline document collaboration on briefs (Google-Docs-style multiplayer
  cursor on a brief markdown). Comments are enough; defer multi-cursor.
- SSO / SCIM provisioning of guest accounts. Manual invites are fine for
  the pilot.
- Mobile-specific collaboration affordances. Desktop-first.
