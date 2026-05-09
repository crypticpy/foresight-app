# Admin Console — Discovery Management (5-PR Phased Plan)

**Date:** 2026-05-09
**Branch base:** `main` at `03f3346` (PR #31 audit log just merged)
**Status:** Plan only. Companion to `docs/23_ADMIN_AUDIT_LOG_AND_COST_GUARDRAILS.md` (PR #32 cost guardrails is the other open item).

## Why these 5 PRs

The admin console (PR #30) shipped settings for models, chat, and feature flags but
**zero** controls for the discovery pipeline — the system that scans sources and
creates signals/cards. Today an admin cannot:

- See or edit which RSS feeds / news outlets are being scanned (lists are in code).
- Tune any of the discovery quotas or thresholds without redeploying (env-only).
- Tell whether a pillar is being starved or which workstreams are stale.
- Drill into a discovery run to see why N URLs got dropped at triage.
- Manage more than one discovery schedule.

These five PRs add those controls in slices, each scoped to keep the diff
~≤350 LOC so bot review feedback stays manageable (the PR #30/#31 pattern).

## Pipeline recap (single source of truth)

```
manual API ─┐
schedule ───┤              ┌─ Triage (cheap LLM)
weekly cron ┼──> Worker ──> ┼─ Dedup (vector + domain rep)
WS auto-scan┘   (run_id)    ├─ Analyze (expensive LLM)
                            ├─ Embed
                            ├─ Signal Agent (per-pillar)
                            ├─ Persist card + discovered_sources row
                            └─ Lens classify
```

Source-of-truth for run state: `discovery_runs` row + `discovered_sources` rows
(every URL we touched, with `processing_status`, `triage_passed`, `resulting_card_id`).

DiscoveryConfig knobs (env-only today, listed at `discovery_service.py:143-159`):
`max_queries_per_run`, `max_sources_per_query`, `max_sources_total`,
`max_new_cards_per_run`, `similarity_threshold` (0.85),
`weak_match_threshold` (0.75), `name_similarity_threshold` (0.80),
`auto_approve_threshold` (0.95), per-`SourceCategoryConfig` `enabled` + `max_sources`.

`discovery_schedule` table already supports multiple rows (PK id) — only one
is seeded today and only the default is exposed via `PUT /api/v1/discovery/schedule`.

---

## Shared groundwork (no separate PR)

No standalone refactor PR needed. One small piece of housekeeping rides PR A:

- **Extract `routers/admin_discovery.py`** as a sub-router included from `admin.py`.
  `admin.py` is already 800+ lines; adding the discovery surface inline will push
  it past the comfort zone. Sub-router pattern matches `routers/discovery.py` →
  `routers/admin.py` separation we already have.

If PR A is delayed, B–E can target a `# region: discovery` block inside
`admin.py` — but extraction is cheap and cleaner.

---

## PR A — Source catalog + per-source health

### 1. Scope & success criteria

- New `discovery_sources_registry` table is the source-of-truth for which
  feeds/queries the pipeline scans.
- DEFAULT_RSS_FEEDS contents are seeded into the registry by the migration; the
  in-code constant is kept as a fallback for cold-boot only.
- Admin Console gets a 7th tab "Sources" listing every registered source with
  category, last-success time, items-fetched (last 7d), post-triage accept-rate.
- Admin can: enable/disable a source, set a `weight` multiplier, add a custom
  RSS feed (validated via HEAD fetch), block-list a domain.
- Domain-reputation editor (existing endpoints) is surfaced as a sub-panel
  inside Sources.

**Done when:** Disabling an RSS feed in the UI causes the next scheduled run to
skip it; adding a custom feed causes it to be included; per-source health
counts match what `discovered_sources` shows.

### 2. Schema

New migration `supabase/migrations/<ts>_discovery_sources_registry.sql`:

```sql
CREATE TABLE public.discovery_sources_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL CHECK (
        category IN ('rss', 'news', 'academic', 'government', 'tech_blog', 'web_search')
    ),
    name TEXT NOT NULL,                 -- human label
    url TEXT,                           -- RSS URL / domain pattern
    config JSONB DEFAULT '{}'::jsonb,   -- category-specific (e.g. {"keywords": [...]})
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    weight REAL NOT NULL DEFAULT 1.0,   -- multiplier for selection probability
    notes TEXT,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    last_failure_reason TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (category, url)
);

CREATE INDEX idx_dsr_category_enabled
    ON public.discovery_sources_registry (category, enabled);

ALTER TABLE public.discovery_sources_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY dsr_service_role
    ON public.discovery_sources_registry FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
```

Plus a one-shot seed inside the same migration that copies DEFAULT_RSS_FEEDS
into the registry. Domain block-list reuses existing `domain_reputation`
(tier=`blocked` extension) — no new table.

### 3. Backend

- New file: `routers/admin_discovery.py`
  - `GET /api/v1/admin/sources` → list with computed health stats
  - `POST /api/v1/admin/sources` → add custom (validates RSS via HEAD)
  - `PATCH /api/v1/admin/sources/{id}` → enable/disable, weight, notes
  - `DELETE /api/v1/admin/sources/{id}`
- Wire helper `load_active_sources(category)` in `discovery_service.py`:
  query registry, fall back to in-code defaults if registry empty (cold-boot
  / migration-not-run safety). RSS fetcher reads from `load_active_sources("rss")`
  instead of `DEFAULT_RSS_FEEDS` directly. Other categories: same pattern.
- Per-source health stats endpoint: aggregation over `discovered_sources` last
  7d grouped by source URL (or domain for news/web). Computed live; no cron.
- Audit-log integration: every PATCH/POST/DELETE writes via `_log_admin_action`.
- Tests:
  - `tests/test_admin_sources.py` — CRUD happy path, enable/disable round-trip,
    custom-RSS HEAD-validation rejects 404.
  - `tests/test_discovery_sources_registry.py` — `load_active_sources` falls
    back to defaults when table empty; honors `enabled=false`.

### 4. Frontend

- `lib/admin-api.ts`: add `AdminSource`, `AdminSourceHealth` types and the four
  CRUD functions plus `fetchAdminSourceHealth()`.
- `pages/AdminConsole.tsx`: 7th tab "Sources" with subsections per category.
  - Table per category: Name · URL · Enabled · Weight · Last Success · Items 7d · Accept-rate
  - Add-source modal (RSS only in v1)
  - Domain reputation panel uses existing endpoints; no new client code beyond
    moving the calls into this tab.

### 5. Cross-PR dependencies

- **None upstream.** B/C/D/E can merge in any order relative to A.
- A is recommended first because it surfaces the biggest "I can't see anything"
  gap, but is not a hard blocker.

### 6. Risks / open questions

- LOC budget risk: this is the heaviest of the five (table + seed + 4
  endpoints + 1 fetcher integration + UI tab). **If the diff exceeds ~400 LOC,
  split:** ship A1 = registry + read-only listing; A2 = mutations + custom add.
- `weight` multiplier — exact semantics need to be picked: "raise selection
  probability" vs "boost rank". Recommend simple interpretation in v1: weight
  is multiplied into the per-category cap (e.g. weight=2 means double the items
  pulled from this feed up to the global cap). Document on the column.
- Pillar-fetcher reading from the registry is per-category; web-search-style
  fetchers (Serper/SearXNG) don't have discrete URLs. Treat their entries as
  "query templates" stored in `config.query` rather than a `url`. Out of scope
  for v1: only seed RSS into the registry; news/academic/etc. stay in code
  until A2.

---

## PR B — Live discovery thresholds in admin_settings

### 1. Scope & success criteria

- Promote DiscoveryConfig env knobs into `SETTING_DEFINITIONS` (group `discovery`).
- `DiscoveryConfig.from_admin_settings()` classmethod reads admin_settings
  (with the existing nullable-value fallback to env / code defaults).
- Three preset buttons in the UI: **Conservative / Balanced / Aggressive** —
  one click bulk-PATCHes all the discovery settings to a coded preset.

**Done when:** Editing `FORESIGHT_DISCOVERY_MAX_QUERIES_PER_RUN` in the console
takes effect on the next discovery run with no redeploy. Picking "Aggressive"
sets all six knobs to the aggressive preset values.

### 2. Schema

None. Reuses existing `admin_settings` table. The preset endpoint writes
multiple rows in one supabase call.

### 3. Backend

- `routers/admin.py`: extend `SETTING_DEFINITIONS` with 8 new entries (group
  `discovery`):
  - `FORESIGHT_DISCOVERY_MAX_QUERIES_PER_RUN` (number, default 100)
  - `FORESIGHT_DISCOVERY_MAX_SOURCES_PER_QUERY` (number, default 10)
  - `FORESIGHT_DISCOVERY_MAX_SOURCES_TOTAL` (number, default 500)
  - `FORESIGHT_DISCOVERY_MAX_NEW_CARDS_PER_RUN` (number, default 15)
  - `FORESIGHT_DISCOVERY_SIMILARITY_THRESHOLD` (number, default 0.85)
  - `FORESIGHT_DISCOVERY_WEAK_MATCH_THRESHOLD` (number, default 0.75)
  - `FORESIGHT_DISCOVERY_NAME_SIMILARITY_THRESHOLD` (number, default 0.80)
  - `FORESIGHT_DISCOVERY_AUTO_APPROVE_THRESHOLD` (number, default 0.95)
- New endpoint `POST /api/v1/admin/discovery/preset` — body
  `{"preset": "conservative" | "balanced" | "aggressive"}` — writes 8 rows
  via the existing `update_admin_setting` helper (so audit log captures each).
- `discovery_service.py`: `DiscoveryConfig.from_admin_settings()` classmethod;
  call sites that build a default config (`execute_discovery_run`, schedule
  worker) use it. Fallback chain: admin_settings.value → env → in-code default.
- Tests:
  - `tests/test_discovery_config_admin_settings.py` — config picks live values;
    null override falls back to env; preset endpoint writes 8 audit rows.

### 4. Frontend

- `lib/admin-api.ts`: add `applyDiscoveryPreset(token, preset)`.
- `AdminConsole.tsx`, "Models & Chat" tab → rename to "Models, Chat & Discovery"
  _or_ add a "Discovery" subsection in the Settings tab. The 8 new settings
  surface automatically because the settings tab iterates `SETTING_DEFINITIONS`.
  - Add a small "Apply preset" row above the discovery group with three buttons.
  - Confirm dialog before bulk apply (list which fields will change).

### 5. Cross-PR dependencies

- **None.** B is independent of A. If A merges first, the source registry
  picks up the new global caps automatically; if B merges first, A's per-source
  weights apply on top of the live cap.

### 6. Risks / open questions

- Threshold edits take effect _next run_; in-flight runs keep their captured
  config. Document this in the field help text.
- Preset values need product input. Suggested starter (can be tuned in PR):
  - Conservative: 50 / 5 / 200 / 8 / 0.90 / 0.80 / 0.85 / 0.97
  - Balanced (default): 100 / 10 / 500 / 15 / 0.85 / 0.75 / 0.80 / 0.95
  - Aggressive: 200 / 15 / 1000 / 30 / 0.80 / 0.70 / 0.75 / 0.92
- Audit volume: a preset apply writes 8 audit rows. Acceptable; matches
  current "one row per setting change" rule.

---

## PR C — Pillar balance + WS freshness dashboards

### 1. Scope & success criteria

- New "Coverage" tab (or sub-section of Overview): two read-only widgets.
- **Pillar balance**: card-creation histogram by pillar over 7/30/90d windows,
  with a configurable expected-share baseline (default uniform 1/6).
- **Workstream freshness**: WS table sorted by `last_scanned_at` ascending,
  with "stale > 7d" highlight, "Force scan" button per row that hits the
  existing `POST /api/v1/workstreams/{id}/scan` endpoint.

**Done when:** Tab loads in <1s; force-scan button creates a new
`workstream_scans` row visible in the Operations tab.

### 2. Schema

None. Pure analytics queries.

### 3. Backend

- New file or extend `routers/admin_discovery.py` (created in PR A; if PR A
  hasn't merged, put it in `admin.py`):
  - `GET /api/v1/admin/coverage/pillars?days=7|30|90`
    → `{by_pillar: {CH: {cards: 12, share: 0.18}, ...}, total: 67}`
  - `GET /api/v1/admin/coverage/workstreams`
    → list `{id, name, last_scanned_at, scans_30d, cards_added_30d, auto_scan, owner_type}`
- Both queries are aggregations over `cards.created_at` / `workstream_scans` /
  `workstream_cards`. Use existing `asyncio.to_thread` pattern.
- No mutations. Force-scan reuses existing endpoint.
- Tests:
  - `tests/test_admin_coverage.py` — pillars endpoint sums correctly with
    seeded fixture cards; workstreams endpoint returns rows ordered by
    last_scanned_at ASC NULLS FIRST.

### 4. Frontend

- `lib/admin-api.ts`: `fetchPillarCoverage(token, days)` and
  `fetchWorkstreamCoverage(token)` typed clients.
- `pages/AdminConsole.tsx`: add "Coverage" tab.
  - Pillar widget: simple horizontal bar chart per pillar (use existing chart
    primitive if any; otherwise plain `<div>` bars to keep diff small).
  - WS table: name · owner · last scan · scans 30d · cards added 30d · auto-scan toggle · "Force scan" button.
  - Time-window selector (7/30/90d) for the pillar widget only.

### 5. Cross-PR dependencies

- **Soft dependency on PR A**: if `routers/admin_discovery.py` exists,
  C lands inside it. If A is delayed, C lands in `admin.py`.
- No data dependency.

### 6. Risks / open questions

- "Pillar starvation" alerting (Slack/email) is **out of scope** for this PR.
  This PR only surfaces the data; alerting is a separate ticket.
- Auto-scan toggle on each WS row is a write — needs to call existing
  `PATCH /api/v1/workstreams/{id}` with `{auto_scan: bool}`. Confirm that
  endpoint accepts the field (existing on workstream, just plumb through).

---

## PR D — Run debug page

### 1. Scope & success criteria

- Click a discovery run from the Operations tab → drill into a Run Detail page.
- Per-stage counts: fetched / triaged_passed / triaged_failed / deduped /
  analyzed / cards_created. All derived live from `discovered_sources` filtered
  by `discovery_run_id`.
- Per-stage tokens & cost (already on the run row in `summary_report`).
- Table of `discovered_sources` for the run with: URL · category · triage_pass · processing_status · resulting_card_id · failure reason.
- Buttons: "Recover orphans" / "Reprocess failed" / "Reanalyze" — wrap the
  three existing endpoints.

**Done when:** Clicking a run shows accurate stage counts that match a manual
SQL query of `discovered_sources`; buttons trigger the right endpoint.

### 2. Schema

None. Read-only over existing `discovery_runs` + `discovered_sources`.

### 3. Backend

- New endpoint `GET /api/v1/admin/discovery/runs/{run_id}/detail` returning:
  - run row
  - aggregate counts grouped by `processing_status` and `triage_passed`
  - paginated discovered_sources rows (`?limit=50&offset=0`)
- Existing recover/reprocess endpoints stay as-is; the UI just calls them.
- Tests:
  - `tests/test_admin_discovery_run_detail.py` — counts match seeded fixture;
    pagination works.

### 4. Frontend

- `lib/admin-api.ts`: `fetchRunDetail(token, runId, params)`.
- New component `AdminRunDetail.tsx` (modal or inline expanded panel under the
  Operations tab — probably modal to keep the tab compact).
- Ops tab table: each row's "View" button opens the modal.
- Stage-counts widget at top, then paginated discovered_sources table, then
  three action buttons at bottom.

### 5. Cross-PR dependencies

- **None.** Independent of A/B/C/E.

### 6. Risks / open questions

- `discovered_sources` rows can be large (full content stored). The detail
  endpoint should NOT return `full_content` or `content_embedding` — explicitly
  select-list the columns we need.
- Per-stage timings are not currently captured. Token/cost are on
  `summary_report.token_tracking` already (per `discovery_service.py:1801`).
  Surfacing wall-clock per stage requires extra instrumentation — defer to a
  follow-up.

---

## PR E — Schedule CRUD

### 1. Scope & success criteria

- Full CRUD UI for `discovery_schedule` rows (today only `PUT` of a single
  default row is exposed).
- Per-schedule fields: name, enabled, interval_hours, pillars_to_scan,
  process_rss_first, max_search_queries_per_run, plus _new_ per-schedule
  scope overrides (categories, source allowlist).
- "Next 5 runs" preview computed client-side from `interval_hours` +
  `last_run_at`.
- Global pause toggle in the UI wraps `FORESIGHT_DEMO_FREEZE` (already a
  setting; just add a one-click toggle on this tab).

**Done when:** Creating a schedule with `enabled=true` and a near-future
`next_run_at` triggers a worker pickup; disabling it stops further runs.

### 2. Schema

Migration `<ts>_discovery_schedule_extensions.sql` (additive only):

```sql
ALTER TABLE public.discovery_schedule
    ADD COLUMN IF NOT EXISTS categories_to_scan TEXT[]
        DEFAULT ARRAY['rss', 'news', 'academic', 'government', 'tech_blog'],
    ADD COLUMN IF NOT EXISTS source_ids UUID[],   -- subset of registry IDs
    ADD COLUMN IF NOT EXISTS notes TEXT;
```

### 3. Backend

- `routers/discovery.py`: keep existing `GET/PUT /api/v1/discovery/schedule`
  (back-compat), and add full CRUD set:
  - `GET  /api/v1/discovery/schedules` (plural; lists all)
  - `POST /api/v1/discovery/schedules`
  - `PATCH /api/v1/discovery/schedules/{id}`
  - `DELETE /api/v1/discovery/schedules/{id}`
- Worker (`worker.py:545`) already polls every row where `next_run_at <= now`
  AND `enabled=true` — no change needed for multi-row support.
- DiscoveryConfig honoring `categories_to_scan` and `source_ids`: the worker
  passes them into config when launching the run.
- Audit-log every CUD via `_log_admin_action`.
- Tests:
  - `tests/test_discovery_schedules_crud.py` — create/list/update/delete;
    deleting a schedule does not delete its past runs.

### 4. Frontend

- `lib/admin-api.ts`: `fetchSchedules`, `createSchedule`, `updateSchedule`,
  `deleteSchedule`.
- `AdminConsole.tsx`: extend the existing "Models & Chat" or Operations tab
  (whichever ends up housing schedules) with a "Schedules" sub-panel:
  - Schedules table: name · enabled · interval · pillars · last run · next run
  - Edit / Delete row actions
  - Create form (modal)
  - Global pause toggle at top of tab — single button that flips the
    `FORESIGHT_DEMO_FREEZE` admin setting.

### 5. Cross-PR dependencies

- **`source_ids` field is meaningful only after PR A** ships the
  `discovery_sources_registry` table. If E merges before A, leave `source_ids`
  in the schema but hide the source-selector UI behind a feature check.

### 6. Risks / open questions

- `cron_expression` column exists but is comment-only ("reference only");
  worker uses `interval_hours`. Decide: keep as-is (display-only in UI), or
  promote to actual cron evaluation. Recommend keep-as-is for v1.
- Default schedule row is hard-deleted by the migration's `INSERT … ON CONFLICT`
  if name='default' was previously upserted. Before adding DELETE: confirm we
  don't crash the worker if zero schedules exist (worker should no-op cleanly —
  verify in PR).

---

## Suggested merge order

A → B → C → D → E was my initial recommendation, but each is independent enough
that we can re-order based on which lever is most painful. Concrete suggestion:

1. **B first** (smallest, biggest immediate ergonomic win — admins can finally
   tune thresholds without redeploy)
2. **A second** (biggest table-stakes feature, also unblocks E's `source_ids`)
3. **C** (read-only, low risk, high visibility)
4. **D** (debugging payoff for the operator persona)
5. **E** (multi-schedule is a "nice to have" until pilot has real cadence needs)

Total intended diff across all five: ~1500 LOC. Each PR ≤350 LOC keeps Sourcery
/ Codex / CodeRabbit feedback to ~1 fixup commit per PR (matches PR #30/#31
pattern).

---

## Notes for future-me

- Don't expand `admin.py` further — extract `routers/admin_discovery.py` in
  PR A and route subsequent admin-discovery endpoints there.
- Reuse `_log_admin_action` from PR #31 for every mutating endpoint added in
  these PRs. New `action` strings to register in audit:
  `admin.source.create`, `admin.source.update`, `admin.source.delete`,
  `admin.schedule.create`, `admin.schedule.update`, `admin.schedule.delete`,
  `admin.discovery.preset.apply`.
- The settings nullable-value pattern (`null` = "fall back to env / default")
  is load-bearing — preserve it in the new discovery settings (PR B).
- Don't add a new "framework" or service for source weighting in PR A — keep
  it as a multiplier on the existing per-category cap.
