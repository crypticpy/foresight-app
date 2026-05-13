# Per-User Workstream Clones — Design Plan

**Status:** Draft, awaiting approval before implementation
**Author:** drafted by Claude, design owned by maintainer
**Date:** 2026-05-13
**Related:** `docs/16_PRD_Kanban_Redesign_and_Sharing.md`

---

## Problem

Today's three default workstreams (Intergovernmental & Civic Capacity,
Climate / Infrastructure, etc.) are stored as single org-owned rows
(`workstreams.owner_type='org'`, `user_id IS NULL`). All authenticated
users see them, but:

1. The `workstream_cards` table has no `user_id` column. Kanban status,
   position, notes, and reminders live per-(workstream, card), so any
   move would be visible to every user.
2. `app/authz.py` therefore grants regular users `role='org_viewer'`
   with `can_edit=False`. Org workstreams are effectively **read-only
   for everyone except admins**.

The maintainer wants the opposite of "read-only for everyone": every
user gets a private working copy of the org workstream where they can
move, delete, note, and curate cards independently, while still
benefiting from a single shared discovery pipeline that scans the org
template once and fans new matches out to every user.

---

## Goals

- One discovery scan per template, not per user-clone.
- Each user has private kanban state (status, position, notes,
  reminders, dismissals) on every org workstream.
- New cards matching a template's filters reach every user's clone
  inbox without manual action.
- Existing users see the same set of cards on first read after
  rollout as they would have seen before — no perceived data loss.
- User-created workstreams keep their current per-user semantics.

## Non-goals

- Real-time collaboration on a single workstream (already covered by
  the existing `workstream_members` sharing flow; out of scope here).
- Cross-user analytics on what users do with shared cards.
- Backfilling pre-rollout user activity (there is none — pilot stage,
  no production users per the `project_pilot_status` memory).

---

## Proposed model

### Three roles for a workstream row

```
workstreams.owner_type        meaning
─────────────────────────────────────────────────────────────────
'org'        (no user_id)     Template. System-managed filter +
                              card pool. Not directly shown in the
                              kanban; serves as the discovery source
                              and the source-of-truth card list.
'user_clone' (user_id set,    Auto-materialized personal copy of a
              cloned_from_id)  template. Has its own workstream_cards
                              rows; visible in the user's kanban.
'user'       (user_id set,    Hand-built personal workstream
              cloned_from_id   (current behavior).
              IS NULL)
```

The `cloned_from_id` column is new (FK to `workstreams.id`). The
template row stays where it is; only its semantics shift — it stops
being something users open directly and becomes a discovery / fan-out
source.

### New tables

```sql
-- One row per (user, template) pair. Created lazily on first read.
CREATE TABLE user_workstream_clones (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id        UUID NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
    clone_workstream_id UUID NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
    last_fanout_at     TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, template_id)
);

-- One row per (user, template, card) the user has dismissed. The
-- fan-out job consults this before inserting new cards into the
-- user's clone, so re-discovered cards do not resurface.
CREATE TABLE user_workstream_card_dismissals (
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id  UUID NOT NULL REFERENCES workstreams(id) ON DELETE CASCADE,
    card_id      UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, template_id, card_id)
);
```

### Existing tables: minimal change

- `workstreams` gets `cloned_from_id UUID REFERENCES workstreams(id)`.
  The CHECK on `owner_type` is widened to include `'user_clone'`.
- `workstream_cards` is **unchanged**. Rows under a `'user_clone'`
  workstream are implicitly per-user because the parent workstream is
  per-user.
- The org template keeps its own `workstream_cards` rows — these are
  the canonical "pool" the fan-out reads from.

### Discovery flow

- Discovery / signal_agent continues writing matched cards to the
  template's `workstream_cards` (status='inbox'). No change here.
- A new weekly job — running Friday 06:00 America/Chicago via
  APScheduler — does the fan-out:

  ```
  for each template T:
      pool = workstream_cards where workstream_id = T
      for each user_clone C of T:
          new_card_ids = pool.card_ids
              - C.workstream_cards.card_ids
              - dismissals[(C.user_id, T.id)].card_ids
          insert into C.workstream_cards (status='inbox',
              position=next_inbox_position, added_from='auto')
          update user_workstream_clones.last_fanout_at = now()
  ```

- This is the same job that handles the "light Friday refresh" for
  user-created workstreams (re-running their saved filters and
  surfacing newly-matching cards). Single job, two code paths.

### First-touch materialization

When a user opens an org workstream and has no `user_workstream_clones`
row for it:

1. Create a new `workstreams` row with `owner_type='user_clone'`,
   `user_id = current_user`, `cloned_from_id = template.id`, name and
   filters copied from the template.
2. Copy every `workstream_cards` row from the template into the new
   clone with `status='inbox'`, preserving `card_id` only. Position is
   re-assigned starting from 0 in card-creation-date order.
3. Insert a `user_workstream_clones` row with
   `last_fanout_at = now()` so the Friday job doesn't re-fan-out
   cards the user just received.
4. From the API's perspective, return the clone's id, not the
   template's. The user never directly opens the template again.

Existing users hit this path on their next visit; new signups hit it
the first time they navigate to the workstream. There is no
migration-day mass clone.

### Kanban state ownership

Status, position, notes, reminders, `is_watching`, brief generation,
and research history all stay on `workstream_cards` rows. Because
those rows belong to the user's clone workstream, every state change
is naturally private. No change to the kanban router beyond
recognizing the new `'user_clone'` owner type.

### Dismissal flow

`DELETE /api/v1/me/workstreams/{clone_id}/cards/{card_id}` (today's
delete) gets a new side-effect: also insert into
`user_workstream_card_dismissals` keyed by `(user_id, template_id,
card_id)` where `template_id = clone.cloned_from_id`. The Friday
fan-out then skips this card for this user permanently.

Optional follow-up: an "undo dismissal" UI for users who change their
mind. Out of scope for v1.

### Permissions

- A user can read/edit/manage their own `'user_clone'` workstreams
  with the same rights they have on `'user'` workstreams (owner).
- Templates (`owner_type='org'`) stop being readable through the
  public kanban endpoints — only admins see them, via a new
  `/api/v1/admin/templates` surface for filter/curation edits.
- `workstream_members` continues to work on `'user'` and
  `'user_clone'` workstreams alike: sharing a clone with a
  collaborator gives the collaborator a view into that specific
  clone (not a new clone of their own).

---

## Volume and pagination

The card pool per template is expected to stay under ~700 before a
pruning policy kicks in (cards with no user interaction across all
clones get archived).

First-touch materialization can therefore copy the entire pool in a
single transaction — no incremental loading needed at the data layer.

UI side: the kanban view loads at most **20 cards per column** at a
time. Backend gains a cursor parameter on
`GET /api/v1/me/workstreams/{id}/cards`:

- `?cursor=<last_position>&limit=20` returns the next 20 by position
  within each column.
- Frontend uses `@tanstack/react-virtual` (already in the codebase for
  Discover and Signals per `MEMORY.md`) on each column.

---

## Friday refresh job

- Schedule: `CronTrigger(day_of_week='fri', hour=6, minute=0,
timezone='America/Chicago')` in `scheduler.py`.
- Two passes:
  1. **Template fan-out** — for each org template, write missed
     new-card rows into every active user_clone (logic above).
  2. **User workstream refresh** — for each `owner_type='user'`
     workstream that hasn't been scanned in ≥7 days, re-run its
     saved filters against the global card pool and add any new
     matches to inbox.
- Single job, one transaction per template/workstream so a failure on
  one user's clone doesn't poison the rest.
- Emits `job_events` rows for observability (`started`/`progress`/
  `completed`/`failed`) per the project's `job_events` substrate.

Existing nightly discovery in `scheduler.py` stays — discovery itself
still runs continuously, only the _fan-out into user inboxes_ is
weekly.

---

## Migration plan

One migration adds the two new tables and the `cloned_from_id` column.
A second migration (or the same one, idempotent) does **not** create
any clones — first-touch materialization handles that lazily.

```
20260514000001_per_user_workstream_clones.sql
  - ALTER TABLE workstreams ADD COLUMN cloned_from_id UUID
    REFERENCES workstreams(id) ON DELETE SET NULL;
  - ALTER TABLE workstreams DROP CONSTRAINT workstreams_owner_type_check;
  - ALTER TABLE workstreams ADD CONSTRAINT workstreams_owner_type_check
    CHECK (owner_type IN ('org', 'user', 'user_clone'));
  - CREATE TABLE user_workstream_clones ...
  - CREATE TABLE user_workstream_card_dismissals ...
  - CREATE INDEX idx_uwc_user ON user_workstream_clones(user_id);
  - CREATE INDEX idx_uwc_template ON user_workstream_clones(template_id);
  - RLS policies (see below).
```

### RLS sketch

- `user_workstream_clones`: user can SELECT / DELETE rows where
  `user_id = auth.uid()`. INSERT happens server-side via the
  service-role client during first-touch materialization.
- `user_workstream_card_dismissals`: same pattern.
- `workstreams` already has RLS; widening the CHECK doesn't change
  policy logic. Add a policy denying public SELECT on rows where
  `owner_type='user_clone' AND user_id != auth.uid()`.

---

## Open questions

1. **Old read-only org-workstream UI** — do we leave it accessible
   anywhere (e.g. an admin-only debug view of the template), or
   delete the route entirely once the clone path lands? Probably
   leave behind an admin-only template editor.
2. **What constitutes a "card with no user interaction" for the
   pruning policy?** Needs definition before pruning ships, but
   doesn't block this PR — pruning is downstream.
3. **What happens to active research jobs against a card if the user
   dismisses it before the job completes?** Today the brief still
   lands on the workstream_cards row. With clones, the brief should
   stay attached to the user's clone row, not the template pool row.
   Verify in implementation.
4. **Migration of existing comments / briefs / executive briefs
   anchored on `workstream_cards.id`** — the FK from
   `executive_briefs.workstream_card_id` survives as long as the
   user_clone's workstream_cards row exists. First-touch creates a
   new row with a new id, so existing briefs targeting the template's
   row stay on the template (orphaned from the kanban UI). Acceptable
   for pilot since there are no production users yet.

---

## Out of scope for this PR

- Pruning policy (separate downstream effort).
- Cross-clone analytics ("how many users dismissed this card").
- Pagination of the dismissals list ("undo dismissal" UI).
- Moving the "light Friday refresh" message into the user-facing UI
  (e.g. a "next refresh: Friday 6am" banner).

---

## Estimated change surface

- 1 migration (~80 lines).
- `backend/app/authz.py` — recognize `'user_clone'` and route
  permissions to the cloning user.
- `backend/app/routers/workstreams.py` — first-touch materialization
  in `GET /me/workstreams/{id}` and `GET /me/workstreams`.
- `backend/app/routers/workstream_kanban.py` — add dismissal
  side-effect in DELETE; cursor pagination on the list endpoint.
- `backend/app/scheduler.py` — new Friday job + supporting service in
  a new `workstream_refresh_service.py`.
- Frontend: pagination on the kanban columns, route resolution
  (open template id → resolve to clone id), no UI shape change.
- ~12-15 tests (auth matrix, fan-out, dismissal tombstones,
  first-touch idempotency).

Rough size: medium PR, splittable into (1) migration + first-touch +
auth, and (2) Friday job + pagination if it gets too large.
