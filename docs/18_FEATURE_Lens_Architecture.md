# Feature: Lens Architecture — CSP, Strategic Anchors, and Multi-Prompt Classification

**Version:** 0.1 (Draft for Review)
**Date:** 2026-05-07
**Status:** Architecture committed; migrations + classification service in flight (this PR)
**Source briefs:**

- Citywide Strategic Plan PDF (`2026-Citywide-Strategic-Plan.pdf`) — taxonomy + Strategic Anchors
- Ana DeFrates' BOE Horizon Scanning Survey — six CSP priorities + Trend/Driver/Signal vocabulary
- Ana DeFrates email thread, May 4–5 2026 — preference for CSP framing as "simpler and more evergreen" than PPP

**Roadmap parent:** `10_FY26_FORESIGHT_ROADMAP.md`
**Related docs:** `11_PRD_Scoped_Workstreams_and_Frameworks.md` (PPP), `13_FEATURE_Climate_Overlay.md` (geo overlay), `17_PILOT_SECURITY_COST_COLLABORATION_PLAN.md` (cost gating)

---

## 1. Vision

Foresight today encodes one taxonomy (six strategic pillars) and one framework (PPP — People · Place · Partnerships). The Citywide Strategic Plan defines a richer structure that the system already half-supports: those same six pillars, with **Goals → Measures → Strategies** beneath each, plus six cross-cutting **Strategic Anchors** (Equity, Affordability, Innovation, Sustainability & Resiliency, Proactive Prevention, Community Trust & Relationships).

This feature commits to a single architectural decision: **a card is the unit of truth, and frameworks are saved-view configurations over its metadata.** Adding CSP doesn't add a new taxonomy on top of cards; it adds richer _metadata to_ cards, and CSP is one way of rendering that metadata. PPP is another. Climate is a third (via the existing geo-overlay PRD). Future frameworks slot in by configuration, not by migration.

The user-facing surface is a **lens picker** — pick the lens (CSP, PPP, Climate, Budget) and the same card pool re-renders. Cards never "belong to" a framework; they're _seen through_ one.

## 2. Two axes of metadata

Every card carries metadata along two complementary axes:

| Axis                                  | What it is                                                                                    | Source                      | Schema slot                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------- |
| **Strategic Anchors (6, fixed)**      | The City's six cross-cutting values from the CSP. Each card scored 0–100 against each anchor. | LLM-derived per card        | `cards.anchor_scores JSONB`                                       |
| **Operational dimensions (variable)** | App-defined practical filters: budget relevance, climate relevance, geography, time horizon.  | LLM-derived (with override) | `cards.budget_assessment`, `cards.climate_assessment`, `card_geo` |

Frameworks (CSP, PPP) are _saved-view configurations_ over these axes plus the existing `pillar` field, `csp_goal_ids`, `issue_tags`, etc. They are not their own taxonomic root.

### 2.1 The six Strategic Anchors

From the Citywide Strategic Plan, p.3:

| Code                        | Name                            | One-line description (from plan)                     |
| --------------------------- | ------------------------------- | ---------------------------------------------------- |
| `equity`                    | Equity                          | Fair access and outcomes across community.           |
| `affordability`             | Affordability                   | Cost burden on residents and household stability.    |
| `innovation`                | Innovation                      | New approaches, technology, and process improvement. |
| `sustainability_resiliency` | Sustainability & Resiliency     | Environmental, climate, and operational resilience.  |
| `proactive_prevention`      | Proactive Prevention            | Getting ahead of harms instead of reacting.          |
| `community_trust`           | Community Trust & Relationships | Civic engagement, transparency, and partnership.     |

These are flat — they do not nest under priorities. Every card gets a score per anchor. They are the load-bearing concept that makes "lens views" work: a "Climate-relevance view" is `sustainability_resiliency >= 50`; an "Equity-relevance view" is `equity >= 50`; an "Innovation pipeline view" is `innovation >= 70 AND maturity IN ('Concept','Exploring','Pilot')`.

### 2.2 The CSP hierarchy

From the plan (verified by PDF read):

- 6 priorities → existing `cards.pillar` codes (`CH`, `EW`, `HG`, `HH`, `MC`, `PS`).
- ~23 Goals (`CH.1`, `EW.1`, …) → seeded into `csp_goals`.
- ~80 Measures (`CH.1.1`, …) → seeded into `csp_measures`. Measures _are_ the KPIs (each carries `initial_target` and often `target_year`).
- ~150 Strategies (`CH.1.1.1`, …) → **not seeded** in v1. Strategies change quarterly via the AMP cycle; too granular and unstable for a structured tag target.

A card may reference any number of `csp_goal_ids` and/or `csp_measure_ids`. Most cards reference 0–3.

### 2.3 Foresight's own vocabulary stays

Foresight defines `signal_type ∈ {trend, driver, signal}` (per Ana's survey + the BOE working definitions). The plan does not use these terms — they're complementary, not competing. Foresight's signal model points at zero or more CSP Goals/Measures; CSP's measure model is referenced by Foresight cards.

## 3. Card schema additions

```sql
ALTER TABLE cards
  ADD COLUMN signal_type        TEXT  CHECK (signal_type IN ('trend','driver','signal')),
  ADD COLUMN secondary_pillars  TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN anchor_scores      JSONB,
  ADD COLUMN csp_goal_ids       UUID[] DEFAULT '{}'::uuid[],
  ADD COLUMN csp_measure_ids    UUID[] DEFAULT '{}'::uuid[],
  ADD COLUMN issue_tags         TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN budget_assessment  JSONB,
  ADD COLUMN climate_assessment JSONB,
  ADD COLUMN user_metadata      JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN classifier_version TEXT,
  ADD COLUMN classified_at      TIMESTAMPTZ;
```

### 3.1 Field reference

| Column               | Purpose                                                                                             | Shape                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `signal_type`        | Enum from foresight vocabulary                                                                      | `'trend' \| 'driver' \| 'signal'`                                                                                    |
| `secondary_pillars`  | Multi-pillar tagging for cross-cutting cards. Existing `pillar` stays the primary.                  | `text[]` of pillar codes                                                                                             |
| `anchor_scores`      | Per-anchor 0–100 scores                                                                             | `{equity, affordability, innovation, sustainability_resiliency, proactive_prevention, community_trust}` each `0-100` |
| `csp_goal_ids`       | Which CSP Goals this signal relates to                                                              | `uuid[]` referencing `csp_goals.id`                                                                                  |
| `csp_measure_ids`    | Which CSP Measures this signal moves the needle on                                                  | `uuid[]` referencing `csp_measures.id`                                                                               |
| `issue_tags`         | Closed-vocabulary tags (cost_of_living, behavioral_health, etc.) — supersedes per-driver hardcoding | `text[]`                                                                                                             |
| `budget_assessment`  | Operational dimension                                                                               | `{relevance: 0-100, dimensions: [], magnitude_band: enum, cycle: enum}`                                              |
| `climate_assessment` | Operational dimension (see `13_FEATURE_Climate_Overlay.md`)                                         | `{relevance, drivers: [], horizon: enum}`                                                                            |
| `user_metadata`      | User-driven layer over LLM metadata                                                                 | `{overrides: {...}, added: {...}, removed: {...}}`                                                                   |
| `classifier_version` | Bump when prompts change → triggers re-classification                                               | `text`                                                                                                               |
| `classified_at`      | Last classification timestamp                                                                       | `timestamptz`                                                                                                        |

### 3.2 The `user_metadata` layer

Three kinds of user actions, all stored in one JSONB:

```json
{
  "overrides": {
    "anchor_scores": { "equity": 85 },
    "budget_assessment": { "relevance": 90 }
  },
  "added": {
    "secondary_pillars": ["HG"],
    "csp_goal_ids": ["uuid-of-HG.2"],
    "issue_tags": ["custom_grant_eligible"]
  },
  "removed": {
    "secondary_pillars": ["MC"]
  }
}
```

**Effective value resolution** (computed at read time, not stored):

- For scalar fields with overrides: `user_metadata.overrides[field] ?? llm_value[field]`.
- For array fields: `(llm_value ∪ user_metadata.added[field]) - user_metadata.removed[field]`.
- For object fields like `anchor_scores`: per-key override; un-overridden keys keep the LLM value.

**Provenance markers** in the UI:

- LLM-derived value with no user touch → no badge.
- Overridden scalar → "(edited)" badge with hover showing the original LLM value.
- Added array entry → "(user-added)" pill.
- Removed array entry → not shown by default; reveal via "Show suppressed" toggle on card detail.

**Re-classification preserves user_metadata.** When the worker re-runs, it writes only LLM-derived columns; `user_metadata` is untouched. There is a per-lens "Reset to LLM" button on card detail that clears one section of `user_metadata`.

## 4. New reference tables

```sql
-- Six fixed strategic anchors (from CSP plan p.3).
CREATE TABLE strategic_anchors (
  code          TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  display_order INT
);

-- CSP goal hierarchy seeded from plan pages 8–34.
CREATE TABLE csp_goals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pillar_code   TEXT NOT NULL,
  code          TEXT NOT NULL,                  -- 'CH.1'
  name          TEXT NOT NULL,
  description   TEXT,
  display_order INT,
  UNIQUE (pillar_code, code)
);

-- CSP measures (the KPIs).
CREATE TABLE csp_measures (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id        UUID NOT NULL REFERENCES csp_goals(id) ON DELETE CASCADE,
  code           TEXT NOT NULL,                 -- 'CH.1.1'
  name           TEXT NOT NULL,
  initial_target TEXT,                          -- '64% below 2019 levels by 2028'
  target_year    INT,                           -- parsed when present
  display_order  INT,
  UNIQUE (goal_id, code)
);

CREATE INDEX csp_goals_pillar_idx ON csp_goals (pillar_code, display_order);
CREATE INDEX csp_measures_goal_idx ON csp_measures (goal_id, display_order);
```

CSP itself is also added as a row in the existing `strategic_frameworks` table so it sits beside PPP. The framework-categories table for CSP is the existing 6 pillar codes — no new framework_categories rows are created; the renderer reads `cards.pillar` directly when the lens is CSP.

## 5. Classification cascade

A new module: `backend/app/lens_classification_service.py`. The worker invokes it on every new card and on backfill runs.

### 5.1 Pipeline

```
[card text]
     │
     ▼
┌─────────────────────────────────────────────┐
│ 1. Core classification (FULL GPT-4.1)       │
│    Single prompt, structured JSON output.   │
│    Produces: pillar, secondary_pillars,     │
│    signal_type, maturity, multi-factor      │
│    scores (Impact/Velocity/etc.), summary.  │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ 2. Anchor scoring (MINI)                    │
│    Single prompt, all 6 anchor scores.      │
│    Doing them together calibrates better    │
│    than 6 separate prompts.                 │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ 3. CSP goal/measure tagging (MINI)          │
│    Card + (goal+measure list) → arrays of   │
│    matching IDs. Closed vocabulary.         │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ 4. Triage for operational dimensions (MINI) │
│    "Does this need budget_assessment?       │
│    climate_assessment? issue_tag refresh?"  │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ 5. Per-dim prompts (MINI, parallel)         │
│    Only the dims triage flagged. Each       │
│    produces a structured JSON object.       │
└─────────────────────────────────────────────┘
```

### 5.2 Why this shape

- **Anchors don't go through triage.** Every card gets all 6 anchor scores — they're cheap on mini and they drive the lens UX. No reason to skip any.
- **Triage applies only to operational dimensions** (budget, climate, issue_tags). These are not universally applicable: a card about a minor administrative change doesn't need a climate assessment.
- **Core stays full-model.** The original classification (pillar, scores, maturity, summary) is the load-bearing prompt; degrading it would corrupt every downstream view. Mini handles small structured-output prompts; full handles the reasoning-heavy core.
- **Updates use a single combined prompt.** When a card is edited and we want to refresh derived metadata, one mini prompt accepts the existing values + the change and produces the delta. Avoids re-running the full cascade for minor edits.

### 5.3 Cost estimate (back-of-envelope)

Per card on first classification:

- Core (full): ~2K in / 800 out → ~$0.005
- Anchors (mini): ~1K in / 200 out → ~$0.0003
- CSP tagging (mini): ~1.5K in / 200 out → ~$0.0004
- Triage (mini): ~500 in / 50 out → ~$0.0001
- 0–2 dim prompts (mini): ~$0.0006 max

**Total: ~$0.006 per card.** Backfill of ~300 existing cards: ~$1.80. Trivial.

## 6. User-added tagging UI

Cards get a single "Tag this signal" affordance on detail pages. Clicking it opens a tagger panel:

```
┌─────────────────────────────────────────────┐
│ Tag this signal                          ✕  │
├─────────────────────────────────────────────┤
│ Search:  [type to filter…              ]    │
│                                             │
│ ▼ Strategic Pillars (6)                     │
│   ☐ Community Health & Sustainability       │
│   ☑ Economic & Workforce Development        │ (currently primary)
│   ☐ High-Performing Government              │ ← user can add as secondary
│   ☐ ...                                     │
│                                             │
│ ▼ CSP Goals & Measures                      │
│   ▶ Community Health & Sustainability       │ (collapsed)
│   ▼ Economic & Workforce Development        │
│     ▶ EW.1 — Foster equitable economic …    │
│     ▼ EW.2 — Strengthen workforce …         │
│       ☐ EW.2.1 — Apprenticeship enrollment  │
│       ☐ EW.2.2 — Skills certification rate  │
│     ▶ EW.3 — ...                            │
│   ▶ ...                                     │
│                                             │
│ ▼ Strategic Anchors (6)                     │
│   ☐ Equity     ☑ Affordability              │
│   ☐ Innovation ☐ Sustainability & …         │
│   ☐ Proactive  ☐ Community Trust            │
│                                             │
│ ▼ Issue tags (closed vocabulary)            │
│   [+] Add tag from list…                    │
│                                             │
│              [Cancel]      [Save tags]      │
└─────────────────────────────────────────────┘
```

### 6.1 Behaviors

- **Search box** filters all categories simultaneously (substring match on name + code).
- **Tree disclosure** for CSP — Pillar → Goal → Measure. Default collapsed; expanded on type-search.
- **Pre-checked items** = current effective tagging (LLM ∪ user.added − user.removed). User-added entries show a small "(user-added)" pill.
- **Checking a not-already-set item** writes to `user_metadata.added.<field>`.
- **Unchecking an LLM-set item** writes to `user_metadata.removed.<field>` (suppression — not destructive, the LLM value remains visible if user reverses).
- **Unchecking a user-added item** removes it from `user_metadata.added.<field>`.
- **Anchors are scalar, not boolean.** The anchor section of this UI is simpler — six rows with current effective score and an inline editable number; saving writes to `user_metadata.overrides.anchor_scores.<code>`.

### 6.2 Card-detail surfacing

On the card detail page, the metadata section renders three groups in order:

1. **Strategic context** — primary pillar, secondary pillars (if any), signal_type.
2. **CSP alignment** — list of CSP Goals + Measures the card maps to, each with its code, name, and provenance badge.
3. **Anchors** — six rows with score bars; provenance badge per row.
4. **Operational dimensions** — budget, climate, geo (when present), with provenance.

Each group has an inline edit button that opens the tagger or the score-override mini-form.

### 6.3 Server-side enforcement

User-added tags are visible to all viewers of the card by default (consistent with how cards are shared). If the user is `browse_only` (per `17_PILOT_SECURITY_COST_COLLABORATION_PLAN.md`), the tagger is read-only — the role gates the mutation, not the view.

## 7. Backfill strategy

A new worker job — `backend/app/jobs/backfill_classification.py` — runs on the next deploy:

1. Selects cards where `classifier_version IS NULL` or older than current. Processes in batches of 50.
2. Per card: full cascade (§5). **Writes only LLM-derived columns**; never touches `user_metadata`.
3. Writes `classified_at` + `classifier_version` after each card. Resumable — restart picks up where it left off.
4. Cost cap via env: `MAX_BACKFILL_PER_HOUR` (default 200 cards/hr). Easier to remove the cap than recover from a $500 surprise.
5. Admin endpoint `/api/v1/admin/classify/backfill` to re-trigger after a prompt change.

When `classifier_version` is bumped (e.g., we change the anchor prompt), the next worker pass re-classifies stale cards on its own schedule. Self-healing.

**Existing data is never deleted or overwritten.** Existing cards just _grow_ the new fields. Old views keep working.

## 8. Lens picker (renderer layer)

A workstream view (and the main Discover view) gets a lens dropdown:

| Lens            | What it does                                                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **None**        | Default: existing render.                                                                                                                          |
| **CSP**         | Group cards by `pillar`. Within each pillar, sort by which `csp_goal_ids` they touch (frequency-weighted).                                         |
| **PPP**         | Existing PPP rendering — group by `framework_categories` via the existing `drivers` mapping.                                                       |
| **By Anchor**   | Six tabs (Equity / Affordability / etc.); each tab lists cards with `anchor_scores[code] >= 50`, sorted desc.                                      |
| **Climate**     | Cards where `climate_assessment.relevance >= 50`. Reads `13_FEATURE_Climate_Overlay.md` overlay when geo data lands.                               |
| **Budget Book** | Cards where `budget_assessment.relevance >= 70` AND `budget_assessment.cycle IN ('FY26','FY27')`. Drives `12_PRD_Budget_Book_Export.md` rendering. |

The lens picker is a saved-view config (JSON), not a DB schema. New lenses are added by configuration. Custom user-saved lenses are a future enhancement not in this PR.

## 9. Sequencing — what's in this PR

This PR lands the **load-bearing schema + planning + initial seeds**. Classification service, backfill worker, and frontend pieces follow as subsequent commits or separate PRs.

Landed on this branch:

- [x] `docs/18_FEATURE_Lens_Architecture.md` (this doc)
- [x] `docs/13_FEATURE_Climate_Overlay.md` v0.3 update (URL cross-check + ATX Flood Pro + GIS for Climate hub)
- [x] Migration: ALTER `cards` columns + CREATE `strategic_anchors`, `csp_goals`, `csp_measures`
- [x] Seed: CSP framework row + 6 strategic_anchors rows
- [x] Seed: csp_goals + csp_measures (data extracted from plan PDF)
- [x] `backend/app/lens_classification_service.py` (cascade — full core + mini anchors/CSP/triage with conditional dim prompts)
- [x] Pydantic models for anchor_scores, budget_assessment, climate_assessment, user_metadata, plus effective-value helpers
- [x] Wire into discovery pipeline for new cards (fire-and-forget after `_create_card_from_source` insert)
- [x] Backfill admin endpoint (`POST /api/v1/admin/classify/backfill`)

Still to come on this branch (or a follow-up PR):

- [ ] `lib/lens-api.ts` + lens picker component
- [ ] Card-detail tagger UI + override form
- [ ] User-added tag mutation endpoint(s)
- [ ] Tests for the cascade service (mocked OpenAI responses)

In separate PRs (out of scope here):

- Frontend lens picker rollout to additional pages (Workstream, Discover)
- Saved custom lenses
- Survey-side anchor multi-select (would require Ana to update the BOE survey form)

## 10. Open questions

- **Survey-side anchors** — Ana's survey is already live, can't add an anchor multi-select field now. Anchors stay LLM-derived for v1. If we see calibration drift, revisit at v0.2.
- **Strategy-level seeding** — keeping strategies (level 4 in the CSP hierarchy) out of the database for now. They change quarterly via the AMP cycle. Revisit if a downstream feature needs strategy-level filtering.
- **PPP coexistence** — both PPP and CSP run as siblings indefinitely. Whether to eventually deprecate PPP's `framework_categories` and `drivers` tables is a future decision; the lens layer hides the difference from users.
- **Custom user issue tags** — v1 limits `issue_tags` to a closed vocabulary. If users start asking for free-text tags, we add a `card_user_freetext_tags` table later, not a free-form column.

## 11. Risk register

| Risk                                                | Mitigation                                                                                                                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM anchor scores feel arbitrary to users           | Provenance badges, inline override, "Reset to LLM" button. Low-effort recourse for any disagreement.                                                                             |
| CSP goal seed drifts when the plan updates          | `classifier_version` bump on seed change → backfill re-runs goal tagging on next deploy.                                                                                         |
| User_metadata schema explodes if we add many lenses | Single JSONB with `{overrides, added, removed}` keeps shape stable; only the keys grow.                                                                                          |
| Backfill burns credits                              | `MAX_BACKFILL_PER_HOUR` cap; mini for everything except core. Total backfill cost is <$2 for current pool.                                                                       |
| Tagger UI confuses primary vs secondary pillars     | Primary stays at the top of the card detail with a label; secondary pillars render as smaller pills. Anchor scores never confused with pillar tags (different visual treatment). |
| Browse-only role can mutate via direct API          | Server-side role check on every `user_metadata` mutation endpoint, not just the frontend.                                                                                        |
