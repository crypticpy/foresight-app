# Signal Sharing, Followers, and Artifact Visibility

**Status:** Draft (planning)
**Author:** Claude + product owner
**Date:** 2026-05-08
**Branch:** `feat/signal-collab`
**Companion docs:**

- `16_PRD_Kanban_Redesign_and_Sharing.md` — shipped kanban-level sharing primitives. Signal-level sharing was explicitly deferred there.
- `18_COLLABORATION_FEATURES_PLAN.md` — collaboration tiers + workstream-level collab.
- `19_PHASE_3_COLLABORATION_IMPLEMENTATION_PLAN.md` — workstream member/role scaffolding.

---

## TL;DR

Signal-level sharing is missing today. Users can share a workstream kanban card but cannot share an individual signal from `/signals/:id` or `/discover/:id`. Followers exist only as a per-workstream `is_watching` flag — there's no way to see how many people across the system care about a given signal. And signals that already have generated artifacts (executive brief, deep-research report) give no visual cue from the card surface, so users have to open every card to find out where the high-effort content lives.

This plan adds three things on a single branch:

1. **Cross-system followers** on every signal, with a count visible from card detail and an opt-in follow toggle.
2. **A native Share button** on signal detail using the Web Share API (mobile share sheet on devices that support it; copy-link fallback elsewhere). Shareable link is **auth-gated** — recipients must sign in. PDF download remains unauthenticated.
3. **Artifact indicators** on signal cards — a tiered visual system that calls out which signals have a brief, deep-research report, or scan summary, without crowding the card.

A fourth quiet improvement bundles in: when a card has deep research, the share + export flows include the report alongside the overview by default.

---

## Problem

### Sharing today

`POST /api/v1/share-links` exists in `backend/app/routers/share_links.py` and supports `target_type=card`. The schema and endpoints work. But:

- The signal-detail UI (`CardDetail.tsx`, `SignalDetailModal.tsx`) has no Share button. The user has to navigate to a workstream kanban card to share.
- The frontend has no `/shared/:token` route. Even if a user manually shares a link via the API, recipients have nowhere to land.
- `card_export.py` exposes PDF/PPTX/CSV export, but the export does not include deep-research content. Users sharing a "researched" card actually share only the auto-generated overview.

### Followers today

`workstream_cards.is_watching` (added in `20260507000001_kanban_status_v2.sql`) is scoped to `(workstream_id, card_id, user_id)`. It tells us "this user is watching this card _inside this workstream_." It does **not** give us:

- A count of distinct users following a signal across all surfaces.
- A signal-level follow toggle visible from `/discover` or `/signals` (which have no workstream context).

### Artifacts are invisible from the card surface

A card may have:

- A generated `executive_brief` (table: `executive_briefs`)
- One or more `research_tasks` of type `deep_research` with a completed report
- A `workstream_scan` summary referencing it
- Future: forecasts, comparisons, user notes

None of these surface as a visual cue on the card itself. The user has to open the detail view to find out the card has been researched. This wastes the most expensive content we generate.

---

## Goals

1. Surface cross-system follower count on every signal and let any paid user follow/unfollow.
2. Add a native Share button to signal detail (Discover + Signals + Workstream contexts). Use the device's share sheet on mobile; fall back to copy-link on desktop.
3. Auth-gate the share viewer. Unauthenticated visitors see a friendly "contact the sender" page, not a public preview.
4. Make artifact presence (brief, deep research, scan) visible at a glance from any signal card surface, without visual overload.
5. When a card has a completed deep-research report, include it in the PDF export and share payload by default.

## Non-goals (this branch)

- Public/anonymous share viewing (deferred — could be a flag later).
- Follower digest / email notifications. Followers exist as data; we do not fan out updates yet.
- Server-side outbound email (Web Share API on the user's device handles email when they pick the email option from the share sheet).
- Editing artifacts from the share view.
- Cross-workstream artifact aggregation views.
- A separate "artifact library" page.

---

## Personas

- **Sally — workstream owner.** Has a card with deep research she wants to send to a colleague. Today she has no Share button on the signal page itself.
- **Marcus — colleague who receives a shared link.** Has a Foresight account. Clicks the link, expects to land on the signal in read-only form.
- **Dana — external recipient with no account.** Clicks the link. We do not let her view the signal; we tell her to ask Sally for an account.
- **Phillip — pilot user browsing /discover.** Wants to know which signals already have a deep-research report so he can prioritize what to read.

---

## Surfaces affected

| Surface               | File                                         | What changes                                                       |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| Signal detail (page)  | `pages/CardDetail.tsx`                       | + Follow toggle, + Share button, + artifact chips in header        |
| Signal detail (modal) | `components/SignalDetailModal.tsx`           | Same as page                                                       |
| Discover grid         | `pages/Discover.tsx`                         | + Artifact corner-ribbon on each card                              |
| Signals list          | `pages/Signals.tsx`                          | + Inline artifact icons next to title                              |
| Workstream kanban     | `components/kanban/KanbanCard.tsx`           | + Artifact ribbon (compact) + folder tab when deep research exists |
| CardDetailHeader      | `components/CardDetail/CardDetailHeader.tsx` | + actions slot now includes Follow + Share                         |
| New                   | `pages/SharedSignal.tsx`                     | New route at `/shared/:token`                                      |
| New                   | `components/ShareSignalModal.tsx`            | Web Share + copy-link + download-PDF                               |
| New                   | `components/ArtifactIndicator.tsx`           | Tiered indicator component (corner ribbon, folder tab, full chips) |

---

## Phase plan

Single branch `feat/signal-collab`, four phases as separate commits. Merge as one PR.

### Phase 1 — Cross-system signal followers

#### Schema

```sql
-- supabase/migrations/<ts>_card_followers.sql

CREATE TABLE card_followers (
    card_id    UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (card_id, user_id)
);

CREATE INDEX card_followers_user_idx ON card_followers (user_id, created_at DESC);
CREATE INDEX card_followers_card_idx ON card_followers (card_id);

ALTER TABLE card_followers ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read counts (we'll aggregate via RPC).
CREATE POLICY card_followers_select ON card_followers
    FOR SELECT USING (auth.role() = 'authenticated');

-- Users can only insert/delete their own follow row.
CREATE POLICY card_followers_insert_own ON card_followers
    FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY card_followers_delete_own ON card_followers
    FOR DELETE USING (user_id = auth.uid());
```

We also add a counter function for efficient reads:

```sql
CREATE OR REPLACE FUNCTION card_follower_counts(card_ids UUID[])
RETURNS TABLE (card_id UUID, follower_count INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
    SELECT card_id, COUNT(*)::int
    FROM card_followers
    WHERE card_id = ANY(card_ids)
    GROUP BY card_id;
$$;
```

#### Backend

- **`backend/app/routers/card_followers.py`** (new):
  - `POST /api/v1/cards/{card_id}/follow` → 201 with `{follower_count, is_following}`. Idempotent (PK conflict = no-op).
  - `DELETE /api/v1/cards/{card_id}/follow` → 200 with `{follower_count, is_following: false}`.
  - `GET /api/v1/cards/{card_id}/followers` → `{follower_count, is_following}`. Used on detail load.
- **`backend/app/routers/cards.py` / `discovery.py`**: extend the card GET response shape with `follower_count` and `is_following` (one extra query, gated to authed user).
- Bulk-list endpoints (`/api/v1/discover`, `/api/v1/signals`, `/api/v1/me/discovery-queue`) get follower counts in a single batched RPC call (`card_follower_counts(card_ids)`) and merge in the response. Avoid N+1.
- Models: `CardFollowerResponse`, `FollowToggleResponse` in `backend/app/models/card_followers.py`. Re-export from `__init__.py`.

#### Frontend

- **`lib/card-followers-api.ts`** (new): `followCard(cardId, token)`, `unfollowCard(cardId, token)`, `getFollowers(cardId, token)`.
- **`components/CardDetail/CardActionButtons.tsx`**: add Follow toggle. Icon button with state (`UserPlus` / `UserCheck`) plus a hover label `Followed by N people`. Optimistic update on click; revert on error.
- **`hooks/useFollowCard.ts`** (new): tiny hook wrapping API + optimistic state.
- The follower count itself shows as a small number next to the icon. No separate counter chip — keeps the action row compact.

#### Acceptance criteria

- [ ] Can follow + unfollow from `/discover/:id` and from a kanban card detail.
- [ ] Follower count updates without full reload.
- [ ] Two browsers logged in as different users see incremented count.
- [ ] Bulk listing endpoints return follower counts without N+1.
- [ ] RLS prevents user A from inserting a follow row as user B.

---

### Phase 2 — Native share button + auth-gated viewer

#### Web Share API approach

The Share button does this in order:

1. If `navigator.canShare?.({ url, title, text })`, call `navigator.share()`. Mobile: native share sheet (Messages, Mail, Slack app, etc.). Desktop Chrome/Edge/Safari: native share menu.
2. Otherwise (Firefox, older Safari, no permission): copy URL to clipboard, show toast `Link copied to clipboard`.

We do not attempt to share files via Web Share. Desktop file-share support is patchy. PDF stays as a separate download.

#### Backend

- **`backend/app/routers/share_links.py`**: already exists. Two changes:
  - `GET /api/v1/share/{token}` currently returns the public payload without auth. Change it to **require auth** (`Depends(get_current_user)`). Return 401 when no token is provided in the Authorization header.
  - Add `created_by_email` and `created_by_name` to the public payload response so the unauthenticated viewer page can display a "shared by" line. (We expose the sender's display name only to the link holder, not the public.)
- No new endpoints — just the auth gate change.

#### Frontend

- **New component `components/ShareSignalModal.tsx`**:
  - Two actions: **Share** (Web Share or copy fallback) + **Download PDF** (existing endpoint).
  - When the card has a completed deep-research report, the modal includes a small chip `Includes deep research report` so the user knows the link viewer + PDF will both contain it.
  - Calls `POST /api/v1/share-links` with `target_type=card` to mint the URL.
- **New page `pages/SharedSignal.tsx`** at route `/shared/:token`:
  - **Authed user**: fetch share payload, render `<CardDetail>` in read-only mode (no edit chrome, no Add-to-Workstream, no Compare). The CardDetail component already accepts a `readOnly` prop pattern in similar pages — extend if needed.
  - **Unauthed user**: redirect to `/login?redirect=/shared/:token`.
  - **Authed but link revoked / expired**: friendly page "This link is no longer active. Contact [sender name] for a new one."
- **New page `pages/SharedSignalAccessDenied.tsx`** (or inlined) for the "contact the sender" message:
  - Headline: `This signal was shared with you.`
  - Body: `Foresight is invitation-only right now. Contact [sender] (sender@city.austin.gov) to request an account.`
  - One CTA: "Sign in" (for users who already have an account but aren't logged in).
- Share button placement on signal detail — top action row in `CardDetailHeader`'s `children` slot, next to existing Compare / Update Research buttons.

#### Acceptance criteria

- [ ] On iOS Safari: Share button opens native share sheet with link.
- [ ] On Android Chrome: same.
- [ ] On desktop Firefox: link is copied to clipboard with toast.
- [ ] Visiting `/shared/:token` while logged in renders the signal read-only.
- [ ] Visiting `/shared/:token` while unauthed redirects to login then back.
- [ ] After login, the user lands back on the shared signal.
- [ ] Revoking a link in `share_links` produces the friendly expired-link page.
- [ ] PDF download from the share modal is the same authenticated download path as the existing `ExportDropdown`.

---

### Phase 3 — Artifact indicators on cards

This is the visual-design phase. The brief from product: **show that a signal has artifacts in a visually compelling way without overloading the card**.

#### Design principles

1. **Hierarchy.** Deep research > brief > scan. Deep research is the most expensive content; it gets the most prominent treatment. Brief is auto-generated; it gets a quieter treatment.
2. **One prominent element per card.** Stacking inside one indicator beats placing multiple indicators around the card edges.
3. **Iconography over text** in compact surfaces (kanban, grid). Words eat horizontal space and fight with the title.
4. **Full chips in detail view.** When you're already on a card, real estate is no longer scarce — show artifact names + last-updated dates as clickable chips.
5. **Color discipline.** Reuse `brand-green` as the artifact color. Do not introduce a new palette.

#### Artifact types tracked

| Type            | Source table                            | Icon (lucide) | Tone                                      |
| --------------- | --------------------------------------- | ------------- | ----------------------------------------- |
| Deep Research   | `research_tasks` (type=`deep_research`) | `Microscope`  | Premium — drives the folder-tab treatment |
| Executive Brief | `executive_briefs`                      | `BookText`    | Standard                                  |
| Workstream Scan | `workstream_scans`                      | `Compass`     | Standard                                  |
| Comparison      | `card_comparisons` (future)             | `GitCompare`  | Future-proofed; not displayed in v1       |

#### Tiered visual system

##### Tier 1 — Compact corner ribbon (default for all cards with any artifact)

A small horizontal pill anchored to the **top-right** corner of the card. Holds up to three monochrome icons stacked horizontally. Tooltip on hover lists artifact names with last-updated dates.

```
┌─────────────────────────────────────────────┐
│                                  ┌──────┐   │  ← top-right ribbon
│ [Pillar] [Horizon]               │📖 🔬 │   │
│                                  └──────┘   │
│ Card Title Here                             │
│                                             │
│ Summary text...                             │
└─────────────────────────────────────────────┘
```

- Width: ~28px per icon, max 3 icons → 84px wide. Height ~18px.
- Background: `bg-dark-surface/80 backdrop-blur-sm` (light mode: `bg-white/90 border`).
- Icons: 14px, `text-brand-green`.
- Position: `absolute top-2 right-2` over the card.
- No counter — if a card has 4+ artifacts, the ribbon tooltip says "+1 more"; the visible icons are the top 3 by hierarchy.

##### Tier 2 — Folder tab (deep-research only — the "researched" badge)

When a card has deep research, the existing top accent bar gets a **small folder-tab protrusion** extending above the top edge of the card. This is the visually compelling cue specifically for the user's "researched" badge ask.

```
        ┌─────────────┐
        │ 🔬 Deep Dive│        ← folder tab protrusion
┌───────┴─────────────┴───────────────────────┐
│═══════════════════════════════════════════════│ ← existing brand-blue → brand-green accent bar
│                                  ┌──────┐   │
│ [Pillar] [Horizon]               │📖    │   │ ← compact ribbon now hides the 🔬
│                                  └──────┘   │
│ Card Title Here                             │
└─────────────────────────────────────────────┘
```

- Tab body: `bg-brand-green text-white`, rounded-top corners, 12px padding-x, 4px padding-y, 11px font, semibold.
- Label: `Deep Dive` (matches `research_tasks.task_type` terminology already used internally).
- Protrudes 14-16px above the card. Card outer container needs `pt-4` to make room.
- Hover: subtle scale 1.05 + brightness 110% glow.
- The corner ribbon (Tier 1) **drops** the deep-research icon when this tab is shown — no double-display. So if a card has both deep research and a brief, the folder tab shows `Deep Dive` and the corner ribbon shows just `📖`.

##### Tier 3 — Full chips (CardDetail header only)

In the detail view, real estate is no longer scarce. Show full chips below the card summary, in the existing badges row:

```
┌───────────────────────────────────────────────────────────────┐
│ Card Title                                                     │
│ Summary lorem ipsum...                                         │
│ ─────────────────────────────────────────────────────────────  │
│ [Stage: Pilot] [Anchor: Resilience]                            │
│ [🔬 Deep Dive · updated 2d ago] [📖 Brief · 5d ago]            │  ← full artifact chips
│ Created: 2026-04-15                                            │
└───────────────────────────────────────────────────────────────┘
```

- Each chip is clickable and scrolls to / switches the detail tab to that artifact.
- Date is human-relative.
- If an artifact is currently being generated (research task `processing`), chip shows a spinner and "Researching..." instead of date.

#### Per-surface mapping

| Surface            | Tier 1 ribbon | Tier 2 folder tab | Tier 3 full chips |
| ------------------ | :-----------: | :---------------: | :---------------: |
| Discover grid card |       ✓       |         ✓         |                   |
| Signals list row   |       ✓       |                   |                   |
| Workstream kanban  |       ✓       |         ✓         |                   |
| CardDetail header  |               |                   |         ✓         |

The list row is too thin for a folder tab; we use only the ribbon there.

#### Component shape

`components/ArtifactIndicator.tsx` exposes a small primitive set:

```tsx
interface CardArtifacts {
  hasDeepResearch: boolean;
  hasBrief: boolean;
  hasScan: boolean;
  deepResearchUpdatedAt?: string;
  briefUpdatedAt?: string;
  scanUpdatedAt?: string;
  pendingResearch?: boolean; // shows spinner state
}

<ArtifactRibbon artifacts={card.artifacts} />              // Tier 1
<ArtifactFolderTab visible={card.artifacts.hasDeepResearch} />  // Tier 2
<ArtifactChips artifacts={card.artifacts} onSelect={...} />      // Tier 3
```

The Card type gains an `artifacts: CardArtifacts` field, populated from a backend join — see schema below.

#### Backend support

- Card GET responses (single + bulk) include an `artifacts` object derived from joins to `executive_briefs`, `research_tasks`, `workstream_scans`. The join logic lives in `backend/app/services/card_artifacts.py` (new), used by `routers/cards.py`, `routers/discovery.py`, `routers/signals.py`, `routers/workstream_kanban.py`.
- For bulk lists, batch the joins. One round trip per artifact type, hashed by `card_id` in Python.
- Cache for 60s per (user_id, card_id_set) — the artifact set rarely changes within a single page session.

#### Acceptance criteria

- [ ] A card with no artifacts shows no extra visual elements.
- [ ] A card with only a brief shows just the corner ribbon with `📖`.
- [ ] A card with deep research shows the folder tab `Deep Dive` and the corner ribbon shows secondary artifacts only.
- [ ] Hovering the corner ribbon shows a tooltip listing artifact names + dates.
- [ ] Clicking a Tier 3 chip in CardDetail switches to the relevant tab.
- [ ] Bulk Discover load with 60 cards does not slow page paint by >100ms vs. baseline.
- [ ] Visual review of kanban + grid + list views confirms the design feels coherent (no unintended doubling of indicators).

---

### Phase 4 — Bundled export when artifacts exist

Final phase, smaller in scope, but unblocked once Phase 3's `card_artifacts` service exists.

#### Backend

- `card_export.py` PDF renderer adds an `include_research: bool = True` query param. When true and the card has a completed deep-research report, append the report markdown as a second section in the PDF after the overview.
- Same flag flows through `share_links.public_share` payload so a link recipient sees the same combined doc when they download.
- Brief content (when present) gets included as a third section. Title each section clearly: `Overview / Deep Research / Executive Brief`.

#### Frontend

- ShareSignalModal automatically passes `include_research=true` when the card has a completed report.
- Existing `ExportDropdown.tsx` gets a checkbox `Include deep research report` (default checked when artifact exists, hidden when it doesn't).

#### Acceptance criteria

- [ ] PDF download for a card with deep research is one document containing all three sections, in that order.
- [ ] PDF download for a card without deep research is identical to today's output.
- [ ] Section headings, page breaks, and citation formatting are clean.

---

## API contracts

### New endpoints (Phase 1)

```http
POST /api/v1/cards/{card_id}/follow
→ 201 { follower_count: number, is_following: true }

DELETE /api/v1/cards/{card_id}/follow
→ 200 { follower_count: number, is_following: false }

GET /api/v1/cards/{card_id}/followers
→ 200 { follower_count: number, is_following: boolean }
```

### Modified endpoints

- `GET /api/v1/cards/{id}` — add `follower_count`, `is_following`, `artifacts`.
- `GET /api/v1/discover` — add same per item.
- `GET /api/v1/signals` — add same per item.
- `GET /api/v1/me/discovery-queue` — add same per item.
- `GET /api/v1/workstreams/{id}/kanban` — add same per item.
- `GET /api/v1/share/{token}` — now requires auth. Returns `{ target_type, target_id, data, created_by_name, created_by_email, expires_at }`.

### Card response shape additions

```ts
interface Card {
  // ... existing fields
  follower_count: number;
  is_following: boolean;
  artifacts: {
    has_deep_research: boolean;
    has_brief: boolean;
    has_scan: boolean;
    deep_research_updated_at?: string;
    brief_updated_at?: string;
    scan_updated_at?: string;
    pending_research?: boolean;
  };
}
```

---

## Telemetry

Tag with `feat=signal-collab` on each event so we can isolate the rollout.

- `card.followed` — `{card_id, source: "detail" | "list"}`
- `card.unfollowed`
- `card.shared` — `{card_id, method: "native_share" | "copy_link"}`
- `card.share_link_visited` — `{token, was_authed: bool}`
- `card.exported_pdf` — `{card_id, included_research: bool, included_brief: bool}`
- `card.artifact_chip_clicked` — `{card_id, artifact_type}`

---

## Rollout

- Single PR off `feat/signal-collab` with all four phases.
- No feature flag — pilot user count is small and the surface is read-mostly. We can revert with a single migration rollback if follower counts misbehave.
- Run the touched-file lint + typecheck pass per CLAUDE.md before merging.

---

## Open questions

1. **Sender display in the access-denied page.** Show sender's full name + email, or just first name? Default: `firstname.lastname@austintexas.gov` since that's the only directory we have for pilot users.
2. **Follower visibility scope.** Counts visible to all authed users (proposed). Alternative: only show the count to the card's pillar lead. Default = visible to all; revisit if it becomes a privacy concern.
3. **Artifact chip naming.** "Deep Dive" matches internal taxonomy; "Deep Research" matches the user-facing button label on `Update Research`. Need to pick one and use it consistently across the chip, the button, and the section heading. **Recommendation: "Deep Dive"** for the indicator (short, fits in folder tab) and "Deep Research" for the long-form button.
4. **Artifact freshness threshold.** When does `deep_research_updated_at` stop being shown? Never, or fade after 90d? Default: always show — older research is still research.
5. **Brief inclusion in PDF default.** Auto-include the brief alongside deep research, or require user to opt in via the export dropdown? Default proposed: auto-include both.
6. **Share-link expiry default.** `share_links` table supports `expires_at`. Today there's no UI to set it; we mint with no expiry. Should signal share links default to 30 days? **Recommendation: yes, 30 days** — limits exposure if someone forwards a link.

---

## Out-of-scope items captured for follow-on branches

- Follower digest emails ("These 3 signals you follow updated this week").
- Public anonymous share viewing.
- Artifact deletion / regeneration flows.
- Per-user share-link analytics (who clicked, when).
- Comments on shared signals (existing comment model can be extended in a separate branch).

---

## DRI

Codex (Claude). Will hand off PR for review before merge.
