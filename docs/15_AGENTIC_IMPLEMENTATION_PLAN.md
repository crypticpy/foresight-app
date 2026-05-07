# 15 — Agentic Implementation Plan

**Status:** v0.1 (2026-05-06)
**Scope:** Sequencing for the FY26 Foresight reactivation under agentic tooling. No timelines — each phase is gated by exit criteria, not calendar dates. The plan is the order in which agents should load documentation, open branches, write code, and merge.
**Companion docs:**

- `10_FY26_FORESIGHT_ROADMAP.md` — what we are building and why.
- `11_PRD_Scoped_Workstreams_and_Frameworks.md` — strategic frameworks + scoped workstreams.
- `12_PRD_Budget_Book_Export.md` — "Looking Ahead" PDF export.
- `13_FEATURE_Climate_Overlay.md` — climate-adaptation triad and map surface.
- `14_UX_INTEGRATION_PLAN.md` — UI/UX integration across all features.
- `adr/README.md` — Architectural Decision Records template + queue.

---

## 0. How to use this plan

This document is the entry point for any agent (human or AI) starting work on the FY26 reactivation. Every phase below specifies:

1. **Doc context** — which planning docs (and which sections) to load before writing code. Do not start a phase without reading these.
2. **Branch** — the branch name to open from `main`. One branch per phase, merged before the next phase starts.
3. **Schema** — migrations that must land in `supabase/migrations/`.
4. **Backend** — modules/files to add or extend in `backend/app/`.
5. **Frontend** — components/pages to add or extend in `frontend/foresight-frontend/src/`.
6. **Exit criteria** — observable checks that gate merging.
7. **Agent shape** — single agent vs parallel agents, with file ownership boundaries.

**Phases are sequential** unless explicitly marked parallelizable. Do not start phase N+1 until phase N has merged and exit criteria are green.

---

## 1. Pre-flight — sync to GitHub before development

Before any new feature work, the planning docs (`docs/10_*` through `docs/14_*`, this doc, `docs/adr/`, and `docs/README.md`) need to land on `main` so collaborators have a shared baseline and so feature branches diverge from a clean point.

### Steps

1. From repo root, confirm working tree:
   ```bash
   git status
   git log --oneline -5
   ```
2. Stage the planning bundle explicitly (do not use `git add -A`):
   ```bash
   git add docs/README.md \
           docs/10_FY26_FORESIGHT_ROADMAP.md \
           docs/11_PRD_Scoped_Workstreams_and_Frameworks.md \
           docs/12_PRD_Budget_Book_Export.md \
           docs/13_FEATURE_Climate_Overlay.md \
           docs/14_UX_INTEGRATION_PLAN.md \
           docs/15_AGENTIC_IMPLEMENTATION_PLAN.md \
           docs/adr/
   ```
3. Commit on `main` with a `docs:` prefix (these are planning docs; no code is changing):
   ```
   docs: FY26 reactivation planning bundle (roadmap, PRDs, climate overlay, UX, ADRs)
   ```
4. Push:
   ```bash
   git push origin main
   ```
5. Confirm on GitHub that the docs render and the ADR index is reachable.

**Do not push without user confirmation.** Stage and commit; surface the diff; wait for the user's go-ahead before `git push`.

---

## 2. Git hygiene rules for the rollout

These rules apply to every phase below. They exist because the FY26 work touches schema, multiple services (web + worker), and a deployed frontend — small mistakes cascade.

- **One branch per phase.** Name format: `feat/<phase-slug>` (e.g. `feat/strategic-frameworks-schema`, `feat/looking-ahead-export`, `feat/climate-overlay-spike`). Spike branches use `spike/<slug>`. ADR branches use `docs/adr-<nnn>-<slug>`.
- **Branch from `main`** at the start of each phase; rebase on `main` before opening a PR; never merge `main` into the feature branch with a merge commit.
- **Conventional commit prefixes:** `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`. Match the project's existing log style (see `git log` head).
- **Atomic commits.** A schema migration, the backend wiring that uses it, and the frontend that consumes it can each be their own commit on the same branch — but a half-applied migration without consumers should not be on `main`.
- **Never push to `main` directly** during feature work. Open a PR from the feature branch. Pre-flight (Phase 1) is the only direct-to-`main` action in this plan.
- **Never force-push a shared branch.** Force-push only on personal spike branches that no one else has pulled.
- **Never skip hooks** (`--no-verify`, `--no-gpg-sign`). If a hook fails, fix the underlying issue and create a new commit — do not amend a commit that hooks rejected.
- **Migrations are append-only.** If a migration on `main` has a bug, ship a corrective migration; do not edit the original file.
- **Worker imports.** Any change to module layout under `backend/app/` must be verified against `backend/app/worker.py` imports before merging — the worker is a separate Railway service and crash-loops on stale imports.
- **Type-check the frontend.** Run `npx tsc --noEmit` from `frontend/foresight-frontend/` on every frontend-touching branch before opening the PR.
- **Tests stay green.** `pytest` (backend) and `pnpm test:run` (frontend) must pass on the branch before merge. Do not disable a failing test to ship.
- **PR description references docs.** Each PR body links the planning doc(s) the work implements (e.g. "Implements §3 of `11_PRD_Scoped_Workstreams_and_Frameworks.md`"). This keeps reviewers oriented and creates a paper trail.
- **Cost guardrails on by default.** Until Phase 9, every new pipeline invocation must respect `FORESIGHT_DEMO_FREEZE` (commit `6cb527b`) and the per-workstream `scan_budget` once that field exists. Agents must not bypass either.

---

## 3. Phase order (overview)

| #   | Phase                                                         | Output                                          | Branch                             |
| --- | ------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------- |
| 1   | Pre-flight sync                                               | Planning docs on `main`                         | (direct to `main`)                 |
| 2   | Strategic frameworks schema + workstream extension            | Tables + migrations + backend models            | `feat/strategic-frameworks-schema` |
| 3   | PPP seed + framework picker + Org/My split                    | First org-owned workstreams visible in UI       | `feat/ppp-seed-and-picker`         |
| 4   | Driver filter + workstream detail header                      | Driver chips, "Informs:" line, Budget Relevance | `feat/driver-filter-and-detail`    |
| 5   | Looking Ahead export (3 presets)                              | PDF export usable from any PPP workstream       | `feat/looking-ahead-export`        |
| 6   | Quarterly Snapshot tab                                        | QPR surface reusing same workstreams            | `feat/quarterly-snapshot`          |
| 7   | Cost guardrail hardening                                      | `scan_budget` + `source_preferences` enforced   | `feat/workstream-cost-controls`    |
| 8   | Climate overlay spike (ADRs + PostGIS + MapLibre)             | Decisions ratified, prototype map               | `spike/climate-overlay`            |
| 9   | Climate Phase 1 datasets (Atlas 14, EDF CVI, Watershed)       | Three layers visible on map                     | `feat/climate-phase-1-datasets`    |
| 10  | Triad UI (layer panel + map selection drawer + Geography tab) | Triad-grouped layers, card↔geography linking    | `feat/triad-ui`                    |
| 11  | Performance-data integration                                  | Department layer ingestion + RLS                | `feat/performance-data-layer`      |
| 12  | ESRI forward-compat hardening                                 | ArcGIS REST adapter behind feature flag         | `feat/esri-bridge`                 |

Phases 5–7 can run in parallel under separate agents _if and only if_ phase 4 has merged — they touch disjoint files. All other phases are strictly sequential because each builds on schema or services from the previous.

---

## Phase 2 — Strategic frameworks schema + workstream extension

**Goal:** Land the data foundation for organization-owned, framework-scoped workstreams without changing any UI yet.

**Doc context:**

- `11_PRD_Scoped_Workstreams_and_Frameworks.md` §3 (data model), §4 (seeds), §6 (sprint S1 deliverables).
- `04_DATA_MODEL.md` — to align with existing `workstreams` table conventions.
- `MEMORY.md` — Backend Patterns, Common Pitfalls.

**Branch:** `feat/strategic-frameworks-schema`

**Schema (new migration):**

- `strategic_frameworks` (`code`, `name`, `description`, `owner_type`, timestamps)
- `framework_categories` (`framework_code`, `code`, `name`, `description`, `display_order`)
- `drivers` (`framework_category_id`, `code`, `name`, `description`, `keywords TEXT[]`, `display_order`)
- `ALTER TABLE workstreams ADD COLUMN framework_code`, `framework_category_id`, `driver_ids UUID[]`, `top25_priority_ids UUID[]`, `budget_relevance TEXT[]`, `purpose_statement`, `owner_type` (default `'user'`).
- RLS policies: `strategic_frameworks` and `framework_categories` are public-read for authed users; `drivers` public-read; `workstreams` keep existing RLS but allow read on rows where `owner_type = 'org'` to all authed users in the same org.

**Backend:**

- `backend/app/models/frameworks.py` — Pydantic models for the three new tables.
- Extend `backend/app/models/workstreams.py` with the new fields.
- `backend/app/routers/frameworks.py` — `GET /api/v1/frameworks`, `GET /api/v1/frameworks/{code}` (categories + drivers nested).
- Extend `backend/app/routers/workstreams.py` to accept the new fields on create/update; validate `framework_code` exists; validate `driver_ids` belong to `framework_category_id`.
- Wire the new router in the app factory.
- Update `backend/app/worker.py` imports if any module path changes.

**Frontend:**

- No UI yet. Just extend the API client types in `lib/workstream-api.ts` and add `lib/frameworks-api.ts` so the types compile and `npx tsc --noEmit` is clean.

**Tests:**

- `pytest backend/tests/test_frameworks_api.py` — list, get-by-code, validation of bad framework codes.
- `pytest backend/tests/test_workstreams_create.py` — extend to cover new fields and rejection cases.

**Exit criteria:**

- Migration applied locally and to remote Supabase via `npx supabase db push`.
- `GET /api/v1/frameworks` returns an empty list (seeds come in phase 3) without erroring.
- `pytest` green; frontend `npx tsc --noEmit` green.
- Worker boots without crash-looping (`/api/v1/worker/health`).

**Agent shape:** Single agent. The work is one schema change + tightly coupled router/model edits.

---

## Phase 3 — PPP seed + framework picker + Org/My split

**Goal:** Surface the three PPP workstreams in the app, owned by the org, visible to all users; let users pick framework + category + drivers when creating their own workstreams.

**Doc context:**

- `11_PRD_Scoped_Workstreams_and_Frameworks.md` §4 (full PPP YAML seed with purpose statements and budget relevance), §6 (S2).
- `14_UX_INTEGRATION_PLAN.md` — Workstreams index reorganization (Organization vs My), `WorkstreamFrameworkPicker` wireframe.

**Branch:** `feat/ppp-seed-and-picker`

**Schema (data-only migration):**

- Insert PPP framework, three categories (People, Place, Partnerships), and the drivers from §4 of the PRD.
- Insert three org-owned workstreams (one per category) with `owner_type='org'`, full `purpose_statement`, `driver_ids`, `budget_relevance` taken verbatim from Ana's email.

**Backend:**

- No new endpoints; existing list endpoint must return org workstreams to all authed users by RLS.
- Add unit test confirming a non-author user can read org workstreams but cannot edit them.

**Frontend:**

- `pages/Workstreams.tsx` — split list into "Organization" group and "My workstreams" group (collapsible).
- `components/workstreams/WorkstreamFrameworkPicker.tsx` — select framework → category → multi-select drivers.
- `components/workstreams/FrameworkBadge.tsx` — colored badge with framework accent bar (per UX plan).
- `components/workstreams/DriverChip.tsx` — driver pill, used in detail header and filters.
- Update create/edit modal to use the picker.

**Tests:**

- Vitest: render `WorkstreamFrameworkPicker`, simulate selection, assert payload shape.
- Playwright: org workstreams visible after login as test user; cannot delete an org workstream.

**Exit criteria:**

- Three PPP workstreams visible on the Workstreams page after login.
- Creating a new personal workstream lets the user pick PPP/category/drivers and persists them.
- `npx tsc --noEmit`, `pnpm test:run`, `pytest` all green.

**Agent shape:** Single agent. Optionally split frontend (picker + index) and seed migration across two agents if needed; they touch disjoint files but are small enough for one.

---

## Phase 4 — Driver filter + workstream detail header

**Goal:** Workstream detail page shows framework header, drivers, "Informs:" line (Top 25 + budget relevance), and the Discover/Kanban views become driver-filterable.

**Doc context:**

- `11_PRD_Scoped_Workstreams_and_Frameworks.md` §5 (UI surfaces).
- `14_UX_INTEGRATION_PLAN.md` — Workstream detail header wireframe, driver filter row, "Informs:" line treatment.

**Branch:** `feat/driver-filter-and-detail`

**Backend:**

- Extend `GET /api/v1/cards` to accept `?driver_id=` repeated param and `?workstream_id=` (already exists) — when both are set, intersect.
- Card↔driver linkage: `cards.driver_ids UUID[]` column (additive migration). Population is best-effort via existing classifier as a follow-up; for now this column may be empty and the filter just narrows by workstream.

**Frontend:**

- `components/workstreams/WorkstreamHeader.tsx` — framework badge, category, drivers, purpose statement, "Informs:" line.
- `components/workstreams/DriverFilterRow.tsx` — horizontal chip row with active-state highlighting.
- `components/workstreams/BudgetRelevanceLine.tsx` — italic green-accented one-liner.
- Wire the filter into `WorkstreamDetail.tsx` so selecting drivers narrows the card list.

**Exit criteria:**

- Workstream detail shows full header per UX plan.
- Driver chips toggle filter state; URL reflects selection (deep-linkable).
- Empty-state copy when zero cards match driver intersection.

**Agent shape:** Single agent.

---

## Phase 5 — Looking Ahead export (3 presets)

**Goal:** Generate the budget-book "Looking Ahead" PDF from any PPP workstream (or all three) in three presets.

**Doc context:**

- `12_PRD_Budget_Book_Export.md` — full doc, especially §3 (presets), §5 (service shape), §7 (boilerplate copy).
- `14_UX_INTEGRATION_PLAN.md` — `LookingAheadExportModal`, `LookingAheadMatrix` preview wireframe.

**Branch:** `feat/looking-ahead-export`

**Backend:**

- `backend/app/services/looking_ahead_service.py` — assembles `LookingAheadMatrix` from workstreams + cards, applies preset selection (`budget_book` PPP-only / `companion` PPP+CSP / `qpr_snapshot` delta layout).
- `backend/app/models/exports.py` — Pydantic `LookingAheadMatrix`, `LookingAheadRow`, `LookingAheadCell`.
- `POST /api/v1/me/exports/looking-ahead` (in `routers/exports.py`) — accepts `{ preset, framework_code?, workstream_ids?, quarter? }`, returns PDF bytes via ReportLab (single-page landscape).
- Footer text and "Why This Works Strategically" boilerplate from the PRD verbatim.

**Frontend:**

- `components/exports/LookingAheadExportModal.tsx` — preset selector, optional framework/workstream filter, preview toggle.
- `components/exports/LookingAheadMatrix.tsx` — on-screen preview that mirrors the PDF layout.
- Triggered from a "Strategy" header dropdown (per UX plan) and from a per-workstream "Export" affordance.

**Tests:**

- `pytest backend/tests/test_looking_ahead_export.py` — PDF generation, preset row counts, no missing fields when a workstream has zero cards.
- Visual regression: snapshot of `LookingAheadMatrix` for `budget_book` preset.

**Exit criteria:**

- All three presets render a valid PDF.
- The `budget_book` preset matches Ana's sample (3 rows, PPP only, single-page landscape).
- Modal accessible from Strategy menu and from each PPP workstream.

**Agent shape:** Two parallel agents OK if needed — one owns `services/looking_ahead_service.py` + `models/exports.py` + `routers/exports.py`, the other owns the modal/preview components. They share only the type definitions in the API client.

---

## Phase 6 — Quarterly Snapshot tab

**Goal:** Same workstreams reused as a CMO QPR surface with delta vs prior quarter, no new schema.

**Doc context:**

- `11_PRD_Scoped_Workstreams_and_Frameworks.md` §8.1 (Quarterly Performance Review surface).
- `14_UX_INTEGRATION_PLAN.md` — `QuarterlySnapshot` component wireframe, cadence chip styling (tabular-nums).

**Branch:** `feat/quarterly-snapshot`

**Backend:**

- `GET /api/v1/workstreams/{id}/quarterly-snapshot?quarter=2026Q2` — derives prior quarter automatically; returns counts, deltas, top-moved cards.
- Reuses existing card/movement queries; no schema changes.

**Frontend:**

- New tab on Workstream detail: Overview / Kanban / **Quarterly Snapshot** / Settings (Map and Geography arrive in later phases).
- `components/workstreams/QuarterlySnapshot.tsx` with delta arrows, cadence chip, "Last refreshed" timestamp.
- "Export this quarter" button reuses Phase 5 modal with `qpr_snapshot` preset preselected.

**Exit criteria:**

- Tab visible on each PPP workstream; populated with current and prior-quarter data.
- Export button generates the QPR-preset PDF.

**Agent shape:** Single agent.

---

## Phase 7 — Cost guardrail hardening

**Goal:** Per-workstream `scan_budget` and `source_preferences` enforced through the discovery and research pipelines so freezing one workstream's spend does not freeze others.

**Doc context:**

- `10_FY26_FORESIGHT_ROADMAP.md` — cost guardrails section.
- `MEMORY.md` — `FORESIGHT_DEMO_FREEZE` and discovery_service patterns.

**Branch:** `feat/workstream-cost-controls`

**Schema:**

- `ALTER TABLE workstreams ADD COLUMN scan_budget JSONB DEFAULT '{"daily_calls": 0, "daily_tokens": 0}'`.
- `ALTER TABLE workstreams ADD COLUMN source_preferences JSONB DEFAULT '{"include": [], "exclude": []}'`.
- `usage_log` table (or extend existing): `workstream_id`, `provider`, `tokens_in`, `tokens_out`, `cost_estimate_cents`, `created_at`.

**Backend:**

- `backend/app/services/cost_gate.py` — `check_budget(workstream_id) -> BudgetDecision`. Called before any model invocation in `discovery_service.py`, `research_service.py`, `brief_service.py`.
- Honor `FORESIGHT_DEMO_FREEZE` as a global short-circuit _before_ the per-workstream check.
- Log every model call to `usage_log` with the originating workstream.

**Frontend:**

- `components/workstreams/WorkstreamBudgetCard.tsx` (compact + full per UX plan) on Workstream Settings tab.
- Org-level overview at `Settings → Cost` showing aggregate usage by workstream.

**Tests:**

- `pytest backend/tests/test_cost_gate.py` — budget exhausted blocks the call; freeze short-circuits before the gate; per-workstream isolation.

**Exit criteria:**

- Setting `scan_budget.daily_calls = 0` on one workstream blocks discovery on it without affecting others.
- `usage_log` populated and visible in the org cost overview.

**Agent shape:** Single agent. The cost gate is a small surface but threads through several services — keep it under one author for coherence.

---

## Phase 8 — Climate overlay spike (ADRs + PostGIS + MapLibre)

**Goal:** Ratify architectural decisions via ADRs, land PostGIS migrations, prove MapLibre + Martin tile path with throwaway data.

**Doc context:**

- `13_FEATURE_Climate_Overlay.md` — full doc, especially §2 (architecture), §4 (schema), §5 (sprint 0).
- `adr/README.md` — ADR template.

**Branch:** `spike/climate-overlay` (spike branch — squash-merge the ratified pieces into a clean follow-up `feat/` branch if preferred).

**ADRs to write and merge first** (each on its own `docs/adr-NNN-<slug>` branch, merged before the spike code):

1. ADR-001 — PostGIS in Supabase as the canonical geospatial store.
2. ADR-002 — MapLibre GL JS as the client renderer (vs Leaflet).
3. ADR-003 — Martin tile server sidecar (vs PostGIS direct + GeoJSON).
4. ADR-004 — ArcGIS REST adapter as the ESRI forward-compat seam.
5. ADR-005 — EPSG:4326 storage / Web Mercator display canonicalization.
6. ADR-006 — Card↔geography linking strategy (`card_geo` table vs inline geom).

**Schema:**

- Enable PostGIS extension migration.
- `admin_boundaries`, `card_geo`, `risk_layers`, `risk_layer_values`, `performance_layers`, `performance_layer_values` per `13_FEATURE_Climate_Overlay.md` §4.
- RLS policies for `performance_layers.sensitivity` (`public` / `internal` / `restricted`).

**Backend:**

- `backend/app/services/geo_service.py` skeleton — `get_layer_geojson`, `get_card_geometries`, `intersect_card_with_layer`.
- `routers/geo.py` — `GET /api/v1/geo/layers`, `GET /api/v1/geo/layers/{code}/geojson`, `POST /api/v1/geo/intersect` (stubbed for spike; real wiring in phase 9).

**Frontend:**

- `pages/Map.tsx` (or Workstream Map tab) — minimal MapLibre map centered on Austin, one synthetic test layer to prove rendering and tile fetch.
- `lib/geo-api.ts` — typed client.

**Exit criteria:**

- All six ADRs merged with `Status: Accepted`.
- PostGIS migrations applied locally and to remote Supabase.
- Map renders one synthetic polygon layer over Austin.
- No real climate data yet — that's phase 9.

**Agent shape:** Sequential. ADR drafting first (one agent), then schema + backend skeleton (second agent), then frontend prototype (third agent). Do not parallelize — each step depends on the previous.

---

## Phase 9 — Climate Phase 1 datasets

**Goal:** Ingest and surface the first three datasets that prove the climate-adaptation triad: Atlas 14 rainfall (projections), EDF CVI (vulnerability), Watershed stormwater incidents (performance).

**Doc context:**

- `13_FEATURE_Climate_Overlay.md` §3 (triad), §6 (sprint 1 datasets).

**Branch:** `feat/climate-phase-1-datasets`

**Backend:**

- `backend/app/source_fetchers/atlas14.py` — pull NOAA Atlas 14 rainfall grids; ingest as `risk_layers` rows.
- `backend/app/source_fetchers/edf_cvi.py` — pull EDF Climate Vulnerability Index by census tract.
- `backend/app/source_fetchers/watershed_incidents.py` — pull Austin Watershed stormwater incident data (CKAN or city open-data API); ingest as `performance_layers` with `data_kind='incident_history'`.
- Worker job entry points for each ingester.

**Frontend:**

- Three layers selectable from the Map view; each rendered with its own legend.

**Exit criteria:**

- Each layer renders with sensible styling and legend.
- Toggling layers on/off does not flicker or reload the base map.
- Ingestion is idempotent (running twice does not duplicate rows).

**Agent shape:** Three parallel agents — one per ingester, each owning its `source_fetchers/<name>.py` file plus a corresponding test file. Frontend layer wiring is a fourth agent that depends on at least one ingester being merged.

---

## Phase 10 — Triad UI (layer panel + map selection drawer + Geography tab)

**Goal:** Group layers by triad bucket, let users select a geography on the map and see related cards, add a Geography tab to card detail.

**Doc context:**

- `14_UX_INTEGRATION_PLAN.md` — `LayerPanel`, `TriadFilter`, `MapSelectionDrawer`, `GeographyTab`, triad color coding (cyan/amber/emerald).
- `13_FEATURE_Climate_Overlay.md` §7 (UX integration with cards).

**Branch:** `feat/triad-ui`

**Backend:**

- `POST /api/v1/geo/intersect` fully implemented — given a geometry, return cards whose `card_geo` intersects.
- `GET /api/v1/cards/{id}/geographies` — list geographies linked to a card.

**Frontend:**

- `components/geo/LayerPanel.tsx` — accordion grouped by triad with the configured color accents.
- `components/geo/TriadFilter.tsx` — three-toggle filter at the top of the panel.
- `components/geo/MapSelectionDrawer.tsx` — slides in when a polygon is clicked; lists cards.
- `components/cards/GeographyTab.tsx` — new tab on Card detail.

**Exit criteria:**

- Clicking a tract in the EDF CVI layer opens the drawer and lists intersecting cards.
- Card detail shows linked geographies with mini-map.

**Agent shape:** Single agent (frontend-heavy, components depend on each other). Backend intersect endpoint can land first as a separate small commit on the same branch.

---

## Phase 11 — Performance-data integration

**Goal:** Productionize departmental performance data with proper sensitivity tiers.

**Doc context:**

- `13_FEATURE_Climate_Overlay.md` §3 (triad layer C), §4 (`performance_layers` schema and RLS).

**Branch:** `feat/performance-data-layer`

**Backend:**

- Hardened RLS for `performance_layers.sensitivity` — `restricted` rows visible only to users with explicit grants.
- `backend/app/services/perf_data_service.py` — generic ingester accepting CSV/GeoJSON with a config blob describing column mapping.
- Admin endpoints for registering new performance layers.

**Frontend:**

- Settings → Layers — admin UI to register/edit performance layers.
- Sensitivity badges in the LayerPanel (lock icon for restricted).

**Exit criteria:**

- A `restricted` layer is invisible to a non-admin user (verified by Playwright login as both roles).
- Admin can register a new CSV-backed layer end-to-end without code changes.

**Agent shape:** Single agent.

---

## Phase 12 — ESRI forward-compat hardening

**Goal:** Behind a feature flag, prove the ArcGIS REST adapter so City of Austin's enterprise GIS can plug in without re-architecture.

**Doc context:**

- `13_FEATURE_Climate_Overlay.md` §8 (ESRI bridge).
- `adr/ADR-004-arcgis-rest-adapter.md` (from Phase 8).

**Branch:** `feat/esri-bridge`

**Backend:**

- `backend/app/integrations/arcgis_rest.py` — read-only adapter that fetches features from an ArcGIS Feature Service URL, normalizes to GeoJSON, and stores in `risk_layers`/`performance_layers` like a native source.
- Behind `FORESIGHT_ENABLE_ESRI` env flag; off by default.

**Frontend:**

- Settings → Layers — "Add ArcGIS Feature Service URL" field when the flag is on.

**Exit criteria:**

- A public ArcGIS Feature Service can be added and renders on the map.
- With flag off, no ArcGIS code paths execute and no env vars required.

**Agent shape:** Single agent.

---

## 4. ADR cadence

ADRs are written before the code that depends on them. The six listed in Phase 8 are the priority queue. New ADRs are added when:

- A choice between two non-trivially-different approaches must be made and locked.
- A future-impacting decision (security, schema shape, third-party dependency) is taken.
- A reviewer asks "why did we do it this way" and the answer is not in the code.

ADRs live in `docs/adr/ADR-NNN-<slug>.md` and are listed in `docs/adr/README.md`. Statuses: `Proposed` → `Accepted` / `Rejected` / `Superseded by ADR-MMM`.

---

## 5. How to invoke agents per phase

For each phase, the orchestrating agent should:

1. Read this doc's section for the phase.
2. Read every linked planning-doc section listed under "Doc context."
3. Open the named branch from `main` (rebased current).
4. If the phase calls for parallel agents, spawn them with explicit file ownership and the exact output shape — never overlapping files.
5. Run `npx tsc --noEmit`, `pytest`, and `pnpm test:run` before opening the PR.
6. Open the PR with a description that links the planning docs and lists the exit criteria with checkmarks.
7. Run `/freview` if the change touches ≥6 files or auth/input/payments.
8. Wait for user confirmation before merging.

Do not start the next phase until the current PR is merged and exit criteria are observably green on `main`.

---

## 6. Done definition for the FY26 reactivation

The FY26 reactivation is "done" when:

- All three PPP workstreams are visible, populated, and exportable in the `budget_book` preset.
- A CMO QPR can be generated from any PPP workstream in the `qpr_snapshot` preset.
- At least one climate-adaptation triad pairing is visible on the map (one A + one B + one C layer) with card↔geography linking working.
- Per-workstream cost guardrails are enforced and visible in the org cost overview.
- The ESRI bridge has shipped behind a flag and been demonstrated with one public Feature Service.
- All ADRs are `Accepted` and current with the implementation.

Anything beyond that is FY27 scope and goes into a new roadmap doc.
