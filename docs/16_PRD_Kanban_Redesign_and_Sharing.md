# Kanban Redesign + Selection-Driven Actions + Sharing

**Status:** Draft / In Progress
**Author:** Claude + product owner
**Date:** 2026-05-07
**Branch:** `feat/kanban-redesign-and-sharing`

## Problem

The current workstream kanban has six columns — Inbox, Screening, Research, Brief, Watching, Archived — but four of them are running variants of the same `gpt-researcher` call at different intensities. The columns conflate three orthogonal concerns:

1. **Stage** (where am I in the workflow?)
2. **Attribute** (is this watched? has it produced a brief?)
3. **Action** (run research, generate a brief, export)

The result:

- New users see six near-identical-looking cards across six columns and can't tell what they're supposed to do.
- "Watching" is a card attribute (alert me on updates) shoved into a stage slot.
- "Brief" is a deliverable type, not a workflow position — a card can be "still being researched" _and_ "has a brief."
- High-leverage actions like portfolio export are buried inside columns most users never visit.
- Sharing is missing entirely: there is no way to email a card to a colleague, send a deep-research result, or generate a stable share link.

## Goals

1. Collapse the kanban to **4 stages** that map to one question each: _what do I need to look at next?_
2. Promote stage-bound buttons to **selection-driven bulk actions** in a global toolbar. Selections cut across columns.
3. Convert "Watching" and brief-status from columns/labels to **card attributes** (chips + filter).
4. Add **sharing primitives**: email a card, copy a stable link to a card or to a deep-research result, and (optionally) attach a generated brief.
5. Replace Inbox-as-drag-target with **quick-triage hover affordances + keyboard shortcuts**.

## Non-goals (this branch)

- Sub-tabs inside Working ("notes / brief draft / updates"). Tracked as a follow-on.
- Server-side outbound email (uses `mailto:` for v1).
- Shareable public links (auth-gated only for v1).
- Cross-workstream selection.
- Comparison view (multi-card side-by-side).

## The 4 columns

| Column       | Definition                         | Action that lands here automatically                       |
| ------------ | ---------------------------------- | ---------------------------------------------------------- |
| **Inbox**    | Untriaged. The system put it here. | New signal matches workstream filters.                     |
| **Working**  | I'm actively investigating.        | User runs Research (Quick or Deep).                        |
| **Ready**    | A shareable artifact exists.       | User generates a brief AND marks it Ready (or exports it). |
| **Archived** | Done or dismissed.                 | User archives, or 30-day Inbox staleness nudge.            |

## Card attributes (chips, not columns)

Stored on the card; rendered as chips and exposed as filters.

- **Watching** (eye icon, toggle). Orthogonal to column. Notifies on updates regardless of stage. Archived cards are muted.
- **Brief status** (`Draft / Ready / Exported`). Visible chip on Working / Ready cards.
- **Last research** (`Quick · 5d ago` / `Deep · 2d ago`). Tells the user whether the analysis is fresh.
- **Pinned** (star, optional, drives sort order).

## Global toolbar (workstream-level)

- **Scan for new signals** (existing).
- **Search / filter bar** (pillar, driver, has-brief, watching, last-research age).
- **Selection mode toggle** — when on, every card shows a checkbox; floating action bar appears with selection count + bulk actions.
- **View switcher** (Board / Feed / Map / List — already present).

## Selection-driven bulk actions

Selection cuts across columns. Floating bar reveals when ≥1 card selected.

- **Generate Portfolio Brief** (PPTX) — assemble selected cards into one deck.
- **Generate Combined Memo** (PDF) — narrative across selected cards.
- **Email selection** (`mailto:`) — pre-filled subject + body with card titles, summaries, and links.
- **Copy share links** — newline-delimited list of card URLs.
- **Bulk archive / restore.**
- **Bulk toggle Watching.**
- **Bulk re-run research** (with depth choice in the dialog).
- **Bulk export raw** (CSV / JSON).

## Per-card actions (the `…` menu)

Always available, irrespective of column:

- **Run Research** → modal asks Quick (5-source) vs Deep (15-source). Replaces the two separate column buttons.
- **Generate Brief** → creates draft / opens existing.
- **Share** → submenu: _Copy link_, _Email card_, _Email card with brief_.
- **Export** (PDF / PPTX) — single-card.
- **Toggle Watching.**
- **Pin.**
- **Archive / Restore.**
- **Move to…** (manual override).
- **Notes.**

## State transitions

| Trigger                                   | Movement                                             |
| ----------------------------------------- | ---------------------------------------------------- |
| New signal matches workstream filters     | → Inbox                                              |
| User runs Research (Quick or Deep)        | Inbox → Working (no-op if already Working)           |
| User generates a brief and marks it Ready | Working → Ready                                      |
| User exports a brief                      | stays in Ready                                       |
| User runs Research on a Ready card        | stays in Ready, brief flagged stale                  |
| User clicks Archive                       | any → Archived                                       |
| User restores                             | Archived → Working (or last-known column if tracked) |
| Inbox card unhandled >30 days             | optional auto-archive nudge (banner)                 |

## Quick-triage UX (Inbox)

The single highest-leverage interaction. Replace drag with:

- **Hover triage bar**: ✓ "interesting" (→ Working), ✗ "dismiss" (→ Archived), 👁 "watch only" (stays in Inbox + Watching on).
- **Keyboard shortcuts** in Inbox: `J/K` to navigate, `R` to research, `B` to brief, `A` to archive, `W` to watch, `Enter` to open.
- **Batch triage mode**: full-screen card-at-a-time review with the same keys.

## Sharing features

### v1 (this branch)

- **Copy link** on any card → URL `…/cards/<slug>` (already exists; surface in card menu).
- **Email card** → opens user's mail client via `mailto:` with subject = card name, body = summary + url + (optional) latest research excerpt.
- **Email card with brief attached** — when a card has a Ready brief, the menu adds _Email with brief PDF_ which downloads then attaches via the user's mail client (or, fallback: provides a copy-paste block).
- **Bulk email selection** — opens `mailto:` with newline-separated card titles + URLs.

### v2 (deferred, documented here for shape)

- Server-side outbound email via SendGrid (digest + on-demand share).
- Public read-only share links with expiry.
- "Send to Slack" via incoming webhook.
- "Export to Google Drive."

## Data model changes

### Backend (`backend/app/`)

1. `models/cards.py` — `KanbanStatus` enum collapses to `inbox | working | ready | archived`. Existing values map:
   - `inbox` → `inbox`
   - `screening` → `working`
   - `research` → `working`
   - `brief` → `ready`
   - `watching` → `inbox` _(but watching=true)_
   - `archived` → `archived`
2. New card columns:
   - `is_watching: boolean` (default `false`)
   - `brief_status: enum('none' | 'draft' | 'ready' | 'exported')` (default `none`)
   - `last_research_depth: enum('none' | 'quick' | 'deep')` (default `none`)
   - `last_research_at: timestamptz | null`
   - `previous_status: kanban_status | null` — restored when un-archiving.
3. New endpoints:
   - `POST /api/v1/cards/{id}/watching` — toggle.
   - `POST /api/v1/cards/{id}/share-payload` — returns `{ subject, body, url }` for the email client (server crafts the body once so we don't duplicate logic in the frontend).
   - Bulk: `POST /api/v1/workstreams/{id}/bulk` with `{ action, card_ids, params }`.
4. Worker / scheduler: Inbox-staleness nudge (30 days) via existing scheduler; emits a notification, does not auto-archive without consent.

### Database (`supabase/migrations/`)

1. `add_kanban_status_v2.sql`:
   - Add new enum values; backfill rows; drop old enum values once cleared.
2. `add_card_attributes.sql`:
   - `is_watching`, `brief_status`, `last_research_depth`, `last_research_at`, `previous_status`.

### Frontend (`frontend/foresight-frontend/src/`)

- `components/kanban/types.ts` — `KANBAN_COLUMNS` reduced to four; column-specific actions removed.
- `components/kanban/KanbanCard.tsx` — render Watching eye, brief-status chip, freshness badge.
- `components/kanban/KanbanCardSelection.tsx` (new) — checkbox + selection state.
- `components/kanban/SelectionActionBar.tsx` (new) — floating bar.
- `components/kanban/QuickTriageBar.tsx` (new) — hover affordances on Inbox cards.
- `pages/WorkstreamKanban.tsx` — wire selection state, bulk action dispatcher, keyboard shortcuts.
- `lib/cards-api.ts` — bulk action client; share-payload client.
- `hooks/useCardSelection.ts` (new) — selection mode + selected ids set.
- `hooks/useKanbanShortcuts.ts` (new) — keyboard shortcuts on Inbox focus.

## Phased rollout (commit plan on this branch)

1. **Foundation:** DB migration + backend enum collapse + card-attribute columns.
2. **Frontend column collapse:** `KANBAN_COLUMNS` to 4, drop column-specific actions, update KanbanColumn / KanbanCard rendering.
3. **Card attributes UI:** Watching toggle, brief-status chip, freshness badge.
4. **Selection mode + bulk action bar:** infrastructure + Generate Portfolio + Bulk archive + Bulk Watching toggle.
5. **Sharing v1:** `mailto:` email card, share-payload endpoint, bulk email.
6. **Quick-triage:** hover bar + keyboard shortcuts on Inbox.
7. **Tests + docs.**

Each phase ships as its own commit.

## Open questions / risks

- **Existing user data** — collapsing `screening`/`research` → `working` is lossy; users may notice cards "skipped a stage." We accept this since we're pre-pilot (per `memory/project_pilot_status.md`).
- **Analytics events** — any dashboard tracking transitions through Screening / Research / Brief will need updating. We'll grep `analytics-api`.
- **Org-owned workstreams** — bulk read actions (Generate Portfolio, Email) should still work; bulk mutations (archive, re-research) should remain gated by the existing `owner_type` check.
- **Inbox staleness nudge** — banner vs notification vs silent auto-archive. v1: banner only.
