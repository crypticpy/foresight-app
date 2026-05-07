# UI/UX Integration Plan — FY26 Reactivation

**Version:** 0.1 (Draft for Review)
**Date:** 2026-05-06
**Status:** Planning — no code yet
**Roadmap parent:** `10_FY26_FORESIGHT_ROADMAP.md`
**Companions:** docs 11–13
**Targets sprints:** S1–S9 (UI work threaded into each sprint)

---

## 1. Design Goals

The reactivation can't just _add features_ — it has to feel like the app got a generation better. Three goals govern every screen below.

1. **Make foresight obvious.** A first-time visitor should see, in under 10 seconds, _what the City is tracking_, _how it's organized_, and _how it ties to budget decisions_. The PPP framework + budget-relevance bridge is the differentiator; it must lead, not hide behind chrome.
2. **Optimize for the four-times-a-year cadence.** Ana's two consumption cycles are an _annual_ budget book and _quarterly_ CMO performance reviews. The IA should make those cadences visible — a "what's due next" beat on the dashboard, not a hunt through pages.
3. **Trust comes from signal density, not chart density.** Lots of small, dense, beautifully rendered facts (one signal, one driver, one risk-tract) beat one giant dashboard. We compose with chips, mini-cards, and inline visualizations — never charts-for-charts'-sake.

The non-negotiables: **brand-blue #44499C / brand-green #009F4D** as identity, **dark-surface tokens** for backgrounds, **rounded-xl + shadow-2xl** for elevated surfaces, **duration-200 ease-out** on every transition, **backdrop-blur-sm** for overlays. These already power the app (`tailwind.config.ts` + `index.css`); we extend, not replace.

## 2. Surface Map — Where Each Feature Lands

A feature is an integration only if it shows up on a real screen. This table is the canonical map.

| Feature (from doc)                      | Primary surface                                                            | Secondary surfaces                                                                | New?                   |
| --------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------- |
| Strategic frameworks (doc 11 §4)        | New `FrameworkBadge` rendered on workstream headers + card detail          | Workstreams index group titles · framework picker on workstream create modal      | Component              |
| Org-level workstreams (doc 11 §4.5)     | `pages/Workstreams.tsx` reorganized into _Organization_ + _My Workstreams_ | Header workstream switcher dropdown · breadcrumbs                                 | Refactor               |
| Drivers + tracked metrics (doc 11 §4.3) | New `WorkstreamFrameworkHeader` block on workstream detail + kanban        | Driver-chip filter row above kanban columns · driver chips on signal cards        | New component          |
| Budget relevance (doc 11 §4.4)          | Italic "_Informs:_ …" line under workstream name everywhere it renders     | Footer of _Looking Ahead_ PDF · workstream tooltip in Header switcher             | New pattern            |
| Cost guardrails (doc 11 §6)             | New `WorkstreamBudgetCard` on workstream detail                            | Toast on scan-cap reached · `/settings` org-cost dashboard for admins             | New component          |
| Source preferences (doc 11 §6)          | Workstream settings drawer (new)                                           | Framework picker auto-suggests defaults                                           | New component          |
| _Looking Ahead_ export (doc 12)         | `LookingAheadExportModal` triggered from Workstreams page                  | New `/budget-book/looking-ahead` preview route · Dashboard "what's due next" beat | New components + route |
| QPR Snapshot variant (doc 12 §11)       | New "Quarterly Snapshot" tab on workstream detail                          | Same export modal with `preset=qpr_snapshot`                                      | New tab                |
| Climate / GIS overlay (doc 13)          | New "Map" tab on workstream detail · `/workstreams/:id/map`                | Card detail "Geography" tab · _Looking Ahead_ optional thumbnail                  | New page + tab         |
| Performance-data layers (doc 13 §3)     | Same Map view, separate `LayerCategory` group in `LayerPanel`              | Card detail Geography tab includes performance values for the boundary            | Same surface           |
| Triad-join filters (doc 13)             | Filter chip row on Map view: _Risk × Vulnerability × Performance_          | "Show signals where" filter on workstream kanban (geo-filter)                     | New pattern            |

## 3. Information Architecture Changes

The current nav is essentially flat (Dashboard, Discover, Signals, Ask, Patterns, Workstreams, Compare, Feeds, Analytics, Methodology, How-it-works, Guides, Settings). Two changes only:

1. **Workstreams becomes the pivot.** Ana's whole workflow is workstream-shaped. We don't add a top-level nav item; instead the Workstream detail page becomes a _workspace_ with tabs: **Overview · Kanban · Map · Quarterly Snapshot · Settings**. Map and Quarterly Snapshot are gated behind feature flags + sprint readiness.
2. **A small "Strategy" affordance in the Header.** A new lightweight dropdown next to the workstream switcher exposes: _Frameworks browser_, _Export Looking Ahead_, _Cost overview_ (admin only). This avoids cluttering the sidebar but gives keyboard-fluent users one-keystroke access to the FY26-specific surfaces.

We do **not** add a top-level "Map" nav item. Maps live inside workstream context — that's the architectural commitment in doc 13 §1 ("place-based lens on signals", not a GIS app).

## 4. New & Modified Screens

### 4.1 Dashboard — "What's due next"

Today the Dashboard is a generic landing. We surface a single new card at the top — `<UpcomingForesightDeliverable>` — answering Ana's two cadences in one beat:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ⏱  Next foresight deliverable                                            │
│  Q3 FY26 Performance Review · CMO · in 12 days (Jun 18)                  │
│  4 org workstreams ready · 23 new signals since last quarter             │
│  [Open Quarterly Snapshot →]   [Manage workstreams]                      │
└──────────────────────────────────────────────────────────────────────────┘
```

When the budget cycle is the next event:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 📘 Next foresight deliverable                                            │
│  FY26–27 Budget Book · Looking Ahead page · in 47 days (Jul 22)          │
│  Draft preview ready · Last edited by Ana · 142 signals included         │
│  [Open Looking Ahead preview →]   [Export PDF]                           │
└──────────────────────────────────────────────────────────────────────────┘
```

Visual: full-width tile with a soft horizontal gradient (brand-blue 10% → dark-surface), the deadline in a `tabular-nums` font, and a single high-contrast primary button. This card is the only thing above the fold that's new — everything else stays consistent.

### 4.2 Workstreams Index — Organization vs. My

The page currently shows a flat list. We split into two visually distinct groups.

```
┌─ Workstreams ───────────────────────────────────────────────────────────┐
│ ⌕ Search workstreams                                       + New stream │
│                                                                          │
│ ━━ Organization (4) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ ┌──────────────────────────┐ ┌──────────────────────────┐               │
│ │ ▣ PPP · People           │ │ ▣ PPP · Place            │               │
│ │ Community Wellbeing &    │ │ Climate, Infrastructure  │               │
│ │ Social Resilience        │ │ & Place-Based Resilience │               │
│ │ ─────────────────        │ │ ─────────────────        │               │
│ │ 38 signals · 5 drivers   │ │ 41 signals · 4 drivers   │               │
│ │ Informs: homelessness    │ │ Informs: wildfire resp., │               │
│ │ services, rental aid,…   │ │ storm drain, utility…    │               │
│ │ ▰▰▰▰▱  62% of monthly cap│ │ ▰▰▱▱▱  31% of monthly cap│               │
│ └──────────────────────────┘ └──────────────────────────┘               │
│ ┌──────────────────────────┐ ┌──────────────────────────┐               │
│ │ ▣ PPP · Partnerships     │ │ ◇ CSP · FY26–27 Priorities│              │
│ │ Intergovernmental &      │ │ Citywide Strategic Plan  │               │
│ │ Civic Capacity           │ │ priority tracking        │               │
│ │ 27 signals · 5 drivers   │ │ 36 signals · 25 prio.    │               │
│ └──────────────────────────┘ └──────────────────────────┘               │
│                                                                          │
│ ━━ My Workstreams (3) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ [existing workstream cards, unchanged styling]                          │
└──────────────────────────────────────────────────────────────────────────┘
```

Visual treatment:

- **Org cards** get the `▣` glyph (filled square = framework) in **brand-blue**, a 1px brand-blue border at 30% opacity, and a faint _gradient sheen_ (brand-blue 5% → transparent) so they read as "official."
- **My cards** keep the existing `dark-surface-elevated` look — no border accent, no glyph.
- **Budget bar** uses the `WorkstreamBudgetCard` component (§4.6).
- **Hover:** card lifts 2px (`hover:-translate-y-0.5`), shadow deepens (`hover:shadow-2xl`), `duration-200`.

### 4.3 Workstream Detail — New Header & Tabs

The detail page becomes a workspace.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◀ Workstreams                                                             │
│                                                                          │
│ ▣ PPP · People                                              [Edit] [⋯]  │
│ Community Wellbeing & Social Resilience                                 │
│ Tracks emerging conditions affecting resident wellbeing, service        │
│ demand, and social stability to inform future investments…              │
│                                                                          │
│ Drivers ──────────────────                                              │
│  [Cost of Living] [Behavioral Health] [Youth/Family] [Equity] [+1 more] │
│                                                                          │
│ Tracked metrics ──────────                                              │
│  rent burden · eviction filings · shelter utilization · trust measures  │
│                                                                          │
│ Informs ──────────────────                                              │
│  Homelessness services · Rental assistance · Public health investments  │
│  · Youth & family programming · Equity-focused interventions            │
│                                                                          │
│ ─────────────────────────────────────────────────────────────────────── │
│  [Overview] [Kanban] [Map] [Quarterly Snapshot] [Settings]              │
│ ─────────────────────────────────────────────────────────────────────── │
│ [tab content]                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

Header conventions:

- The framework glyph + label (▣ PPP · People) lives in a `FrameworkBadge` component, brand-blue background at 12% opacity, brand-blue text, `text-xs uppercase tracking-wide`.
- **Drivers** render as `<DriverChip>` — pill-shaped, dark-surface-deep background, hover reveals "Tracked metrics: …" tooltip, click filters the kanban.
- **Tracked metrics** are a comma list, not chips — they're examples, not filters. Type-treatment: `text-sm text-muted-foreground`.
- **Informs** is the budget-relevance line — italic, `text-emerald-300/80` (tinted brand-green), prefaced by a 1.5px vertical accent bar in brand-green. This is the only non-blue accent on the header and it carries the budget-bridge meaning visually.
- For _user_ workstreams (no framework binding), the entire header section collapses to just the name and description — no driver/metric/budget-relevance rows.

Tabs:

- **Overview** — what's currently the default workstream view (cards grid + recent activity).
- **Kanban** — the existing `WorkstreamKanban` page, lifted in.
- **Map** — climate overlay (§4.7), feature-flagged.
- **Quarterly Snapshot** — QPR variant (§4.8).
- **Settings** — workstream config including framework binding, source preferences, scan budget, auto-scan toggle.

### 4.4 Driver Filter Row (above Kanban / Cards grid)

When inside a framework-bound workstream:

```
Filter:  [All]  [Cost of Living ✓]  [Behavioral Health]  [Youth/Family]  [Equity]
                ─────────────────
                3 of 5 drivers active · clear
```

`<DriverFilterRow>` — sticky below the workstream header, scrollable horizontally on overflow, keyboard-navigable (arrow keys move active chip; enter toggles). Selecting drivers narrows the underlying card query without page reload (the existing kanban subscription already supports filter parameters).

### 4.5 Framework Picker on Workstream Create

The existing `WorkstreamForm.tsx` gets a new step at the top — _Strategic framework_ — with three radio cards.

```
Choose a framework (optional)
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ ▣ PPP        │ │ ◇ CSP        │ │ ✕ None       │
│ People·Place │ │ Citywide     │ │ Personal     │
│ Partnerships │ │ Strategic    │ │ exploration  │
│              │ │ Plan         │ │              │
└──────────────┘ └──────────────┘ └──────────────┘
```

Selecting PPP reveals a category select (People / Place / Partnerships), which auto-checks the relevant default drivers and pre-fills `source_preferences = ["GOVERNMENT","RSS"]` and a low default `scan_budget`. The user can override anything. A small "Why these defaults?" inline link expands an explanation referencing doc 11.

### 4.6 Budget Card

`<WorkstreamBudgetCard>` — appears on the workstream card in the index, on the detail header (compact form), and as a full block in the Settings tab.

```
Compact (in workstream card on index):
  ▰▰▰▰▱  62% · 308K of 500K tokens · resets Jun 1

Full (Settings tab):
┌──────────────────────────────────────────────────┐
│ Monthly scan budget                              │
│ ▰▰▰▰▰▰▰▰▱▱  62% used                            │
│ 308,420 / 500,000 tokens · 124 / 200 requests   │
│ At current rate, you'll reach the cap on Jun 7   │
│ Period resets Jun 1 (UTC)                        │
│                                          [Adjust]│
└──────────────────────────────────────────────────┘
```

Visual: progress bar uses **brand-blue** by default, **amber-400** at 75%+, **red-500** at 95%+. Projection line is computed client-side from period start + current usage. The "Adjust" button opens a drawer with sliders for token cap, request cap, and source-preference toggles.

When the cap is hit, scans show a non-blocking inline banner on the workstream view: "_This workstream's monthly scan budget is reached. Manual scans can still run; auto-scan resumes Jun 1._" — calm copy, not alarming.

### 4.7 Map View (Climate Overlay)

Full-bleed inside the workstream tab. Three regions: **map canvas**, **layer panel** (left), **selection drawer** (right, slides in on click).

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ◀ Climate, Infrastructure & Place-Based Resilience                      │
│ [Overview] [Kanban] [Map] [Quarterly Snapshot] [Settings]               │
├──────────┬──────────────────────────────────────────────────────────────┤
│ Layers   │                                                              │
│          │                                                              │
│ Climate  │              ┌──────────────────────────┐                    │
│ projctn  │              │                          │                    │
│ ☑ Atlas14│              │                          │                    │
│ ☐ Heat   │              │       Travis County      │                    │
│ ☐ IPCC   │              │       (MapLibre canvas)  │   ┌────────────┐   │
│          │              │                          │   │ Tract 48… │   │
│ Risk &   │              │       choropleth +       │   │ EDF CVI .82│   │
│ vulner.  │              │       signal pins        │   │ Atlas14 50y│   │
│ ☑ EDF CVI│              │                          │   │ 4 signals  │   │
│ ☐ TAMU   │              │                          │   │ 12 incidents│  │
│ ☐ Wildfire│             └──────────────────────────┘   │ → details  │   │
│          │                                              └────────────┘   │
│ Performnce                                                              │
│ ☑ Storm  │  Filter: [Risk × Vulnerability × Performance]                │
│   incid. │  ☑ in flood zone  ☐ CVI ≥ 0.7  ☑ ≥1 incident                │
│ ☐ Asset  │                                                              │
│   condition                                                              │
│ ☐ Demand │  ◐ Basemap: OSM   ⛶ Fullscreen   ⤓ Export PNG               │
│   growth │                                                              │
└──────────┴──────────────────────────────────────────────────────────────┘
```

Notable:

- **Layer panel** groups by triad component (§3 of doc 13): _Climate projections_, _Risk & vulnerability_, _Performance_. Each group is collapsible. Toggles use the existing `<Switch>` from `components/ui/`.
- **Triad filter** below the map ("Risk × Vulnerability × Performance") is the operations-level question maker. Each axis is a checkbox that adds a constraint to the join. Reads: _"Show me signals **in flood zone** and with **CVI ≥ 0.7** and with **≥1 incident in last 5 years**."_ Active constraints highlight tracts and pin clusters live.
- **Selection drawer** opens on tract or pin click; shows boundary id, layer values for that boundary, and any signals/incidents inside. CTA "Open card detail" routes to `/cards/:slug`.
- **Map canvas** uses MapLibre. Choropleth color ramps follow the existing **brand-blue → cyan-300 → amber-400 → red-500** scale used by velocity. Pins are 8px circles, brand-green stroke, opacity scaled by composite score.
- **Empty state** — when no `card_geo` rows exist for the workstream yet, the canvas dims and a centered card prompts: "_Map view becomes available once signals have geographic context. Tag a signal's geography from the card detail._"
- **Loading state** — basemap renders first; layer toggles show a `<Skeleton>` chip until the layer data lands.
- **Performance-layer sensitivity** — each layer's chip carries a small lock icon (🔒) when `sensitivity != 'public'`. Hover explains who can see it.

### 4.8 Quarterly Snapshot Tab

Quarter-over-quarter delta view. This is a new render of existing data, not new data.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Quarterly Snapshot · Q3 FY26                                            │
│ vs Q2 FY26                          [Q3 FY26 ▾]  [Export QPR PDF]       │
├─────────────────────────────────────────────────────────────────────────┤
│  +18 new signals     +6 status changes   2 retired                      │
│  ▲ velocity +0.21    ▲ avg. composite +0.04                             │
│                                                                          │
│  Top movers ─────────────────────                                        │
│   ↑ Cost of Living          +9 signals    [drill in]                    │
│   ↑ Behavioral Health       +4 signals    [drill in]                    │
│   ─ Youth/Family           ±0                                            │
│   ↓ Equity                 -1 (retired)                                  │
│                                                                          │
│  What's new since last review                                            │
│   • Eviction filings up 12% (Cost of Living) — Apr 22                    │
│   • BH workforce shortage (Behavioral Health) — Apr 30                   │
│   • Shelter waitlist 230 (Behavioral Health) — May 02                    │
│   …                                                                       │
│                                                                          │
│  Budget relevance touched this quarter                                   │
│   Homelessness services · Rental assistance                              │
└─────────────────────────────────────────────────────────────────────────┘
```

`Export QPR PDF` calls the same export endpoint as Looking Ahead with `preset=qpr_snapshot` (doc 12 §5.2).

Quarter selector is a dropdown of last 4 quarters; the comparison baseline ("vs Q2") updates accordingly. We deliberately keep this single-page and dense — the budget-cadence consumer wants a glance, not exploration.

### 4.9 Looking Ahead Export Modal & Preview

`<LookingAheadExportModal>` triggered from:

- The new Header "Strategy" dropdown (§3).
- A button at the top of the Workstreams index when ≥2 org workstreams are visible.
- The Dashboard "what's due next" tile (§4.1).

```
┌───── Export "Looking Ahead" page ─────────────────────────┐
│                                                            │
│ Preset                                                     │
│  ◉ Budget book   (PPP only · 3 rows)                       │
│  ○ Companion     (PPP + CSP · 4 rows)                      │
│  ○ Quarterly snapshot                                      │
│                                                            │
│ Workstreams                                                │
│  [✓] People  [✓] Place  [✓] Partnerships  [✓] CSP          │
│                                                            │
│ Signals per focus    [▬▬◉▬]  2                             │
│                                                            │
│ Include                                                    │
│  [✓] Budget relevance footer                               │
│  [✓] Strategic rationale                                   │
│  [ ] Place-workstream map thumbnail                        │
│                                                            │
│ Format                                                     │
│  ◉ PDF (print-ready)   ○ Web preview   ○ JSON              │
│                                                            │
│ Generated by  [Ana DeFrates           ]                    │
│                                                            │
│                  [Cancel]   [Preview]   [Export]           │
└───────────────────────────────────────────────────────────┘
```

The modal uses the existing `<Dialog>` primitive (rounded-xl, shadow-2xl, backdrop-blur-sm). The slider for "signals per focus" updates an inline preview count below ("≈8 cards across 12 cells"). The "Place-workstream map thumbnail" checkbox is disabled with an inline note "Available after climate overlay launches" until S8 ships.

The Preview button routes to `/budget-book/looking-ahead?preset=…&signals_per_focus=…` — a full-bleed page with the actual rendered matrix and a top utility bar:

```
┌──── Looking Ahead — preview ──────────────────────────────────┐
│ Generated 2026-06-12 · 142 signals · Budget book preset       │
│                              [Edit options]  [Export PDF]      │
├───────────────────────────────────────────────────────────────┤
│  [matrix as in doc 12 §4]                                     │
└───────────────────────────────────────────────────────────────┘
```

The preview is the _truth_ — the PDF is a render of the same DOM through ReportLab. Visual parity is the acceptance bar.

### 4.10 Card Detail — Geography Tab

A new tab on `/cards/:slug` after S5. Renders only when `card_geo` exists or the user can set it.

```
[Overview] [Sources] [Brief] [Geography] [Notes]

Geography
─────────────────────────────────────────────────
Primary boundary
  ◇ Census tract 48453001801 (Travis County)
  ─────────
  EDF CVI · 0.78 (high vulnerability)
  Atlas 14 · within 500-yr flood zone
  Watershed incidents (last 5y) · 3

Related boundaries
  Council District 9 · Planning area Central East

[ small embedded MapLibre snapshot ]
[ Edit boundary ]   [ Open in workstream map → ]
```

Visual: lock-step with existing tab styling on the page; map snapshot is a thumbnail (no panning) that opens the workstream map view on click — context preserved via `?focus=card-{id}` query param.

### 4.11 Settings — Org Cost Overview (admin only)

A new card on `/settings` for users with `foresight_admin` role:

```
┌─ Organization scan budget ──────────────────────────────────────┐
│ This month                                                       │
│ ▰▰▰▰▰▰▱▱▱▱  54% used                                            │
│ 1.07M of 1.95M tokens · across 4 org workstreams                │
│                                                                  │
│ By workstream                                                    │
│  PPP · People         ▰▰▰▰▱  62%                                │
│  PPP · Place          ▰▰▱▱▱  31%                                │
│  PPP · Partnerships   ▰▰▰▱▱  44%                                │
│  CSP                  ▰▰▱▱▱  35%                                │
│                                                                  │
│ Global automatic spend   FORESIGHT_DEMO_FREEZE: ON (suppressed) │
└──────────────────────────────────────────────────────────────────┘
```

This is the single place an admin gets to see "is this thing safe to leave running" — directly answering Ana's reactivation concern.

## 5. Component Library Additions

New components, all designed to slot into the existing `components/ui/` shadcn-style set. Each is single-purpose, themeable through tokens, exported via barrel for reuse.

| Component                        | Purpose                                       | Used by                                                |
| -------------------------------- | --------------------------------------------- | ------------------------------------------------------ |
| `<FrameworkBadge>`               | Glyph + label for PPP/CSP framework           | Workstream cards · workstream header · card detail     |
| `<DriverChip>`                   | Pill chip for a driver, with metric tooltip   | Workstream header · driver filter row · card detail    |
| `<DriverFilterRow>`              | Sticky filter bar over a card collection      | Kanban · workstream overview                           |
| `<BudgetRelevanceLine>`          | Italic green-accented "Informs:…" line        | Workstream header · workstream card · LA PDF footer    |
| `<WorkstreamBudgetCard>`         | Compact + full progress card                  | Index card · detail header · settings · admin overview |
| `<WorkstreamFrameworkPicker>`    | 3-card framework selector (PPP / CSP / None)  | Create/Edit workstream form                            |
| `<UpcomingForesightDeliverable>` | Dashboard tile with cadence + CTA             | Dashboard hero                                         |
| `<LayerPanel>`                   | Triad-grouped layer toggle list               | Map view                                               |
| `<TriadFilter>`                  | 3-axis combinatorial filter                   | Map view footer                                        |
| `<MapSelectionDrawer>`           | Right-side details panel for tract/pin clicks | Map view                                               |
| `<GeographyTab>`                 | Card-detail geography display + edit          | Card detail                                            |
| `<QuarterlySnapshot>`            | Delta-oriented quarter summary                | Workstream tab                                         |
| `<LookingAheadExportModal>`      | Preset + workstream + format selector         | Header dropdown · workstream index · dashboard         |
| `<LookingAheadMatrix>`           | Server-rendered matrix (mirrors PDF)          | Preview route · LA PDF source-of-truth                 |
| `<StrategyMenu>`                 | Header dropdown with FY26 actions             | Header                                                 |

All extend the existing `cn()` + token-based pattern. None introduces a new color outside the established palette.

## 6. Design Language Reinforcements

Treatments worth codifying so the app reads as one product, not a feature pile-up.

- **Framework accent bar.** Anywhere a workstream is identified by framework, a 2px vertical bar in brand-blue (PPP) or brand-green (CSP) sits to the left of the title. One-line, infinite reuse.
- **"Informs:" line.** Always italic, always preceded by a 1.5px vertical bar in brand-green, always rendered under the workstream name. This is the budget-bridge motif and should appear _consistently_ — list view, detail header, exports, tooltips. Repetition is the point: budget relevance is the message.
- **Triad color coding** (climate overlay only).
  - Projections (A) → cyan-300
  - Risk & vulnerability (B) → amber-400
  - Performance (C) → emerald-300
    Used sparingly on layer panel group headers and triad-filter axis labels — never on choropleth ramps (those keep velocity-style brand-blue→red).
- **Cadence chip.** A small pill on the dashboard tile and Quarterly Snapshot using `tabular-nums` and a tiny clock glyph. Communicates "this is calendar-driven", which is psychologically different from "exploratory."
- **Empty states are illustrations, not error messages.** Each new surface (Map, Quarterly Snapshot, Geography tab) ships with a 280px wide single-color line illustration in brand-blue at 30% opacity, paired with one sentence and one CTA. Style continues the existing `pages/Dashboard.tsx` empty-state pattern.

## 7. Motion & Micro-interactions

A short list of moments that turn "competent" into "distinctive."

1. **Framework badge entrance.** On first paint of a workstream, the framework glyph fades in with a 6px upward translate, `duration-300`. Subtle, but signals the page knows itself.
2. **Driver chip selection.** Click → 1.05× scale tick (`spring`, 200ms) + immediate filter apply. Selected chips get a 1px inset brand-blue ring.
3. **Budget bar fill.** When data loads, the bar animates from 0 to its actual width over 600ms with `ease-out`. Reinforces "this is a measurement," not a decoration.
4. **Map layer toggle.** Toggling a layer cross-fades over 250ms (no hard pop). Choropleth bands ease in via opacity, not shape.
5. **Cap-reached state.** Bar pulses once in amber, then settles. Toast slides in from top-right with `slide-in-from-top-2 fade-in` (existing tailwindcss-animate).
6. **Looking Ahead preview.** When the user adjusts a slider in the modal, the preview matrix re-renders with a 150ms cell cross-fade. No layout shift — column widths are pre-computed.
7. **QPR delta arrows.** Up/down arrows next to driver counts use `motion-safe:animate-in slide-in-from-bottom-1 fade-in` on first render only. Subsequent loads are static (motion is for first-time understanding, not noise).

All animations respect `prefers-reduced-motion`.

## 8. Accessibility & Responsive

- **Keyboard nav.** Driver chips, layer toggles, framework picker cards, and tab strips all use roving-tabindex patterns. Triad-filter checkboxes are real `<input type=checkbox>` for assistive parity.
- **Screen reader copy.** Framework badge announces "Strategic framework: People, Place, Partnerships — People category." Driver chips announce driver name + metric examples. Budget bar announces "62 percent of monthly token budget used."
- **Color independence.** The triad color coding is _secondary_ to text labels — never the only signal. Choropleth ramps include a numeric legend with category names (low/moderate/high), not just hue.
- **Responsive.**
  - Workstream index: 3 cards / row at ≥`xl`, 2 at `lg`, 1 at `md` and below.
  - Workstream header: drivers wrap; "Tracked metrics" collapses behind a toggle on `md` and below.
  - Map view: layer panel becomes a bottom sheet on `md` and below; canvas occupies full width.
  - Quarterly Snapshot: two-column layout collapses to stacked at `md`.
  - Looking Ahead PDF is fixed Letter landscape — desktop-only design assumption is acceptable since it's primarily printed.
- **Print CSS.** `LookingAheadMatrix` route includes a print stylesheet matching ReportLab output, so a user can ⌘P from the preview if the backend PDF is unavailable.

## 9. UI Sequencing — Aligned to Sprint Plan

Each sprint ships a _user-visible_ increment. UI work ladder:

- **S1** — `<FrameworkBadge>`, `<BudgetRelevanceLine>`, `<WorkstreamBudgetCard>` (compact form), Workstreams-index _Organization_ group, Header workstream switcher updates. _Visible:_ Ana logs in, sees the four org workstreams in their own group, can read each workstream's budget relevance and current scan budget.
- **S2** — `<DriverChip>`, `<DriverFilterRow>`, `<WorkstreamFrameworkHeader>`, `<LookingAheadExportModal>`, `/budget-book/looking-ahead` preview route, `<LookingAheadMatrix>`. _Visible:_ drivers are visible and clickable; the _Looking Ahead_ PDF can be exported and previewed.
- **S3** — `<UpcomingForesightDeliverable>`, `<QuarterlySnapshot>` tab, admin org-cost overview, `<StrategyMenu>` header dropdown, full-form `<WorkstreamBudgetCard>` and source-prefs drawer. _Visible:_ dashboard shows next deliverable; admins see org-wide cost; quarterly snapshot tab works on stub data.
- **S4** — _No production UI_; map prototype on a branch, design review only.
- **S5** — `<LayerPanel>` shell, `<MapSelectionDrawer>`, Map tab, basic admin-boundary rendering. _Visible:_ a working but data-thin map for the Place workstream.
- **S6** — EDF CVI choropleth, `<TriadFilter>` (single axis), `<GeographyTab>` on card detail. _Visible:_ first real overlay.
- **S7** — Atlas 14 layer (vector or raster), full triad filter, performance-data layer category in `<LayerPanel>`, sensitivity locks. _Visible:_ triad join works; Watershed incidents on the same map as CVI + flood zones.
- **S8** — Layer composition polish, geographic context section in card briefs, optional map thumbnail on Looking Ahead PDF. _Visible:_ end-to-end story Ana can present.
- **S9** — ESRI tile source toggle, ArcGIS layer registration UI in admin (small). _Visible:_ ESRI layers selectable like any other.

## 10. Open UX Questions

1. **Framework canon visibility.** Should non-PPP/CSP users (a personal-exploration user) ever see the framework chrome, or is it strictly hidden when no framework is bound? (This plan assumes _strictly hidden_.)
2. **Map vs. List default.** When a user opens the _Place_ workstream after S6, do we default to **Overview** or **Map**? Defaulting to Map gets the new capability seen; defaulting to Overview keeps the experience consistent across workstreams. (Plan: Overview default; Map opens on a sticky preference once used.)
3. **Driver chip count discipline.** Some drivers may proliferate (CSP framework has 23 goals). Do we cap visible chips to N=8 with "+N more", or scroll horizontally? (Plan: cap at 8, "+N more" opens a popover.)
4. **Cost UI for non-admin users.** Should a regular user see budget bars at all, or only admins? Visibility builds trust but might create alarm when usage spikes. (Plan: show compact bar to all users; full breakdown admin-only.)
5. **Looking Ahead masthead.** City of Austin seal, Foresight wordmark, both, or neither (so budget staff brand it themselves)? (Plan: both; toggle to remove if Ana wants neutral output.)
6. **QPR baseline.** Default comparison is _previous quarter_. Should Ana also have a year-over-year comparison? (Plan: ship Q-over-Q only in v1; YoY in v2 if asked.)

## 11. Success Criteria for "It Feels World-Class"

Hard to measure, easy to know:

- A first-time visitor lands on the Dashboard and _immediately_ understands what's being tracked and why — without reading any docs.
- Every screen shares the same language: framework glyphs, driver chips, budget-relevance line, brand-blue/green economy of color.
- No screen has more than three competing visual hierarchies.
- Motion is present but quiet — every animation defends itself ("this taught the user something").
- A user with `prefers-reduced-motion` and a screen reader gets the same information density as a sighted, motion-tolerant user.
- The map view does not feel like a different app — it feels like Foresight gained a sense.
- The _Looking Ahead_ PDF does not feel like an export — it feels like it was always the canonical artifact.

If those bullets are true, the reactivation is the level-up Ana asked for.
