# PRD: Scoped Workstreams & Strategic Frameworks

**Version:** 0.2 (Draft for Review)
**Date:** 2026-05-06
**Status:** Planning — no code yet
**Source brief:** Ana DeFrates email thread, May 4 2026
**Roadmap parent:** `10_FY26_FORESIGHT_ROADMAP.md`
**Targets sprints:** S1 (May 19 – May 30), S2 (Jun 2 – Jun 13), S3 (Jun 16 – Jun 27)

> **Provisional framework note.** Ana's email is explicit that the PPP framing was generated in a ChatGPT session based on her interpretation of the FY25–26 CMO budget message page 15. Daniel Culotta may sync with Jessica Ferrari on emerging FY26–27 framing (suspected theme: "tightening our belts"). For that reason this PRD treats the framework taxonomy as **data — not code**. Re-keying CSP to PPP, swapping in a new framework, or running both in parallel must all be one-line config + a re-seed.

---

## 1. Problem

Foresight today supports user-created workstreams scoped by `pillars[]`, `keywords[]`, `goals[]`, `horizons[]`, and `stage_ids[]` (`backend/app/models/workstream.py:13`). The pillar set is the existing Citywide Strategic Plan (CSP) taxonomy: CH, EW, HG, HH, MC, PS (`docs/09_TAXONOMY.md:9`). This works for ad-hoc personal scanning, but does not represent the _organizational_ tracking structure Ana's brief asks for.

Specifically:

- The CMO's FY25–26 budget message introduces a **new framing — People · Place · Partnerships (PPP)** — that is not the same as the CSP pillars.
- Ana wants three pre-defined workstreams, one per PPP pillar, each populated with **drivers** (e.g., "cost of living", "aging infrastructure") and **tracked metrics** (e.g., "rent burden", "stormwater incidents") that are not just freeform keywords.
- Each workstream must also carry **Budget Relevance** — the _anticipated investment categories_ its signals inform. From Ana's brief: the People workstream's signals inform "homelessness services, rental assistance, public health investments, youth and family programming, equity-focused interventions"; Place informs "wildfire response, storm drain rehabilitation, utility resilience, facility hardening, climate adaptation"; Partnerships informs "intergovernmental affairs, regional planning, grant leveraging, public engagement, partnership-based service delivery." This is the _bridge between scanning and budgeting_ and must be visible in-app and on the budget-book page.
- A fourth workstream should track the **Citywide Strategic Plan (CSP) priorities** so the budget cycle can compare CSP-level signals against the new PPP framing. Ana's CSP-centered foresight survey to the Strategy & Performance Forum (financial managers and strategy leads) is the user-research input here.
- All four should be _organizationally_ available — visible to multiple users on the Strategy & Performance Forum without each user re-creating them.
- The same workstreams must support **two consumption surfaces**: (a) the FY26–27 _budget book_ (annual, document-shaped output — see doc 12) and (b) **quarterly performance reviews with CMO** (recurring, dashboard-shaped output — trends, velocity, what changed since last quarter).
- Reactivation cost discipline requires per-workstream control over discovery sources and a hard scan budget. Ana's framing: workstream-scoping _is_ the cost-control mechanism.

## 2. Out of Scope (for this PRD)

- Climate / geospatial overlays (see `13_FEATURE_Climate_Overlay.md`).
- Budget-book export rendering (see `12_PRD_Budget_Book_Export.md`).
- AI-driven driver inference from card content. We treat drivers as a curated reference taxonomy in v1; auto-classification is a v2 enhancement.

## 3. Target State

A user opening Foresight at the start of S3 sees:

- **Four pre-seeded workstreams** under a new "Organization" workstream group:
  - _Community Wellbeing & Social Resilience_ (People)
  - _Climate, Infrastructure & Place-Based Resilience_ (Place)
  - _Intergovernmental & Civic Capacity_ (Partnerships)
  - _Citywide Strategic Plan — FY26–27 Priorities_ (CSP)
- Each workstream lists its **drivers** and **tracked metrics** in a header section, sourced from `strategic_frameworks` reference data.
- Each workstream's discovery scan is bounded by a configurable monthly **scan budget** (default: low) and a **source-category whitelist** (default: government + RSS + academic).
- The existing user-created workstream feature is unchanged.

## 4. Data Model Changes

### 4.1 New table: `strategic_frameworks`

```sql
-- Catalogs frameworks the City uses to organize signals.
-- CSP and PPP are the first two rows; future frameworks plug in here.
CREATE TABLE strategic_frameworks (
  code           TEXT PRIMARY KEY,        -- 'CSP', 'PPP'
  name           TEXT NOT NULL,           -- 'Citywide Strategic Plan'
  description    TEXT,
  source_doc     TEXT,                    -- citation: doc title + URL
  is_active      BOOLEAN DEFAULT TRUE,
  display_order  INT DEFAULT 100,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.2 New table: `framework_categories`

```sql
-- The buckets within a framework.
-- For PPP: 'people', 'place', 'partnerships'.
-- For CSP: 'CH', 'EW', 'HG', 'HH', 'MC', 'PS' (mirrored from existing pillars).
CREATE TABLE framework_categories (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_code TEXT NOT NULL REFERENCES strategic_frameworks(code) ON DELETE CASCADE,
  code           TEXT NOT NULL,           -- 'people', 'place', 'partnerships', 'CH', etc.
  name           TEXT NOT NULL,
  description    TEXT,
  pillar_code    TEXT,                    -- optional bridge to existing pillars table
  display_order  INT DEFAULT 100,
  UNIQUE (framework_code, code)
);
```

### 4.3 New table: `drivers`

```sql
-- A driver is a force/condition the city wants to track signals against.
-- Drivers belong to a framework category and act as both a label and a search-topic seed.
CREATE TABLE drivers (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_category_id    UUID NOT NULL REFERENCES framework_categories(id) ON DELETE CASCADE,
  code                     TEXT NOT NULL,    -- 'cost_of_living'
  name                     TEXT NOT NULL,    -- 'Cost of Living'
  description              TEXT,
  search_topic_seeds       TEXT[] DEFAULT '{}',   -- discovery seed phrases
  tracked_metric_examples  TEXT[] DEFAULT '{}',   -- 'rent burden', 'eviction filings'
  display_order            INT DEFAULT 100,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (framework_category_id, code)
);
```

### 4.4 Workstream extensions

Add columns to the existing `workstreams` table (`supabase/migrations/001_complete_schema.sql:165`):

```sql
ALTER TABLE workstreams ADD COLUMN framework_code         TEXT REFERENCES strategic_frameworks(code);
ALTER TABLE workstreams ADD COLUMN framework_category_id  UUID REFERENCES framework_categories(id);
ALTER TABLE workstreams ADD COLUMN driver_ids             UUID[] DEFAULT '{}';
ALTER TABLE workstreams ADD COLUMN top25_priority_ids     UUID[] DEFAULT '{}';
ALTER TABLE workstreams ADD COLUMN budget_relevance       TEXT[] DEFAULT '{}';
ALTER TABLE workstreams ADD COLUMN purpose_statement      TEXT;
ALTER TABLE workstreams ADD COLUMN owner_type             TEXT NOT NULL DEFAULT 'user'
                                       CHECK (owner_type IN ('user','org'));
ALTER TABLE workstreams ADD COLUMN source_preferences     JSONB DEFAULT '{}'::jsonb;
ALTER TABLE workstreams ADD COLUMN scan_budget            JSONB DEFAULT '{}'::jsonb;
```

`source_preferences` shape:

```json
{
  "categories": ["GOVERNMENT", "RSS", "ACADEMIC"],
  "max_sources_per_scan": 25,
  "exclude_domains": ["example.com"]
}
```

`scan_budget` shape:

```json
{
  "monthly_token_cap": 500000,
  "monthly_request_cap": 200,
  "tokens_used_period": 0,
  "requests_used_period": 0,
  "period_start": "2026-05-01"
}
```

### 4.5 RLS update for org workstreams

```sql
-- Existing policy: user can read/write their own workstreams.
-- New policy: any authenticated user can read org-owned workstreams; only members of
-- 'foresight_admins' can write them.
CREATE POLICY workstreams_org_read ON workstreams
  FOR SELECT USING (owner_type = 'org' AND auth.role() = 'authenticated');

CREATE POLICY workstreams_org_write ON workstreams
  FOR INSERT WITH CHECK (
    owner_type = 'user'
    OR auth.uid() IN (SELECT user_id FROM foresight_admins)
  );
```

## 5. Backend Changes

| File                                                                   | Change                                                                                                                                                                                        |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/app/models/workstream.py`                                     | Add `framework_code`, `framework_category_id`, `driver_ids`, `top25_priority_ids`, `owner_type`, `source_preferences`, `scan_budget` to `Workstream`, `WorkstreamCreate`, `WorkstreamUpdate`. |
| `backend/app/routers/workstreams.py`                                   | New `GET /api/v1/frameworks` and `GET /api/v1/frameworks/{code}` endpoints. Update `create_workstream` to accept framework binding.                                                           |
| `backend/app/helpers/workstream_utils.py:_filter_cards_for_workstream` | Extend to filter cards by `top25_priority_ids` (`top25_relevance` array overlap) and by drivers (keyword-expansion from driver `search_topic_seeds`).                                         |
| `backend/app/discovery_service.py:DiscoveryConfig`                     | Honor per-workstream `source_preferences.categories` and `max_sources_per_scan`.                                                                                                              |
| `backend/app/routers/workstream_scans.py`                              | Before queuing a scan, check `scan_budget` against current period usage; reject with 429 if exceeded. After a scan completes, increment `tokens_used_period` and `requests_used_period`.      |
| New: `backend/app/services/framework_seed.py`                          | Idempotent seed function that loads PPP, CSP, and the four organization workstreams from a YAML file. Run on app boot in non-prod, run via management script in prod.                         |

## 6. Cost Guardrails (responding to Ask 5)

Three-layer defense:

1. **Global freeze** — already shipped in commit `6cb527b` via `FORESIGHT_DEMO_FREEZE`. Suppresses all automatic API spend at the deployment level.
2. **Per-workstream scan budget** — `scan_budget` JSONB on workstreams. The scan worker reads `monthly_token_cap` and `monthly_request_cap`, refuses to start a scan if usage is over, and resets at the start of each `period_start` rollover.
3. **Per-workstream source-category whitelist** — `source_preferences.categories` narrows the candidate-source pool before any LLM is invoked. PPP and CSP workstreams default to `["GOVERNMENT", "RSS"]` only. Users can broaden manually.

Reporting:

- New endpoint `GET /api/v1/me/workstreams/{id}/usage` returns current period usage and remaining budget.
- New admin view `GET /api/v1/admin/usage/by-workstream` for org-wide cost accountability. (Behind admin role.)

## 7. Frontend Changes

| Area                                                     | Change                                                                                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `pages/Workstreams.tsx`                                  | Add an "Organization" group at the top of the workstream list, separate from "My Workstreams".                                           |
| `components/kanban/WorkstreamHeader.tsx` (or equivalent) | If `framework_code` is set, render the framework badge, the category, and a collapsible list of drivers + tracked-metric examples.       |
| New: `components/WorkstreamFrameworkPicker.tsx`          | Used during workstream creation. Lets a user (or admin) pick a framework + category, which auto-suggests drivers and source preferences. |
| New: `components/WorkstreamBudgetCard.tsx`               | Shows `tokens_used_period / monthly_token_cap` with a progress bar. Read from `/me/workstreams/{id}/usage`.                              |
| `lib/workstream-api.ts`                                  | Add `getFrameworks`, `getFramework`, `getWorkstreamUsage` calls.                                                                         |

## 8. Seed Content

The PPP and CSP workstreams ship as YAML the seed function reads:

```yaml
# backend/app/services/seed/frameworks.yaml
frameworks:
  - code: PPP
    name: People · Place · Partnerships (FY26–27)
    source_doc: "CMO Budget Message FY26–27, page 15"
    categories:
      - code: people
        name: Community Wellbeing & Social Resilience
        drivers:
          - code: cost_of_living
            name: Cost of Living
            search_topic_seeds:
              - "rent burden Austin"
              - "eviction filings Travis County"
              - "emergency rental assistance demand"
            tracked_metric_examples:
              - rent burden
              - eviction filings
              - emergency rental assistance demand
              - shelter utilization
              - shelter waitlists
          - code: behavioral_health_homelessness
            name: Behavioral Health & Homelessness
            search_topic_seeds:
              - "Austin homelessness response"
              - "behavioral health workforce shortage"
            tracked_metric_examples:
              - shelter utilization
              - youth program participation
              - community health disparities
          - code: youth_family_needs
            name: Youth & Family Needs
            tracked_metric_examples:
              - youth program participation
              - family wellbeing index
          - code: equity_expectations
            name: Equity Expectations
            tracked_metric_examples:
              - resident sentiment
              - trust measures
      - code: place
        name: Climate, Infrastructure & Place-Based Resilience
        drivers:
          - code: climate_change
            name: Climate Change
            tracked_metric_examples:
              - extreme heat days
              - wildfire frequency
              - flood frequency
          - code: aging_infrastructure
            name: Aging Infrastructure
            tracked_metric_examples:
              - infrastructure condition ratings
              - stormwater incidents
          - code: energy_transition
            name: Energy Transition
            tracked_metric_examples:
              - utility affordability
              - electrification uptake
          - code: housing_landuse_pressure
            name: Housing & Land Use Pressure
            tracked_metric_examples:
              - park & field maintenance demand
      - code: partnerships
        name: Intergovernmental & Civic Capacity
        drivers:
          - code: state_federal_preemption
            name: State / Federal Preemption
            tracked_metric_examples:
              - legislative developments
              - regulatory developments
          - code: regional_interdependence
            name: Regional Interdependence
            tracked_metric_examples:
              - interlocal agreements
              - regional migration patterns
          - code: grant_funding
            name: Grant Funding Availability
            tracked_metric_examples:
              - grant opportunities
          - code: civic_trust
            name: Civic Trust
            tracked_metric_examples:
              - public engagement metrics
          - code: economic_competitiveness
            name: Economic Competitiveness
            tracked_metric_examples:
              - nonprofit / private partnership activity

  - code: CSP
    name: Citywide Strategic Plan
    source_doc: "City of Austin CSP — current edition"
    categories:
      # Mirrors existing pillars table; pillar_code bridges to legacy.
      - code: CH
        name: Community Health & Sustainability
        pillar_code: CH
      - code: EW
        name: Economic & Workforce Development
        pillar_code: EW
      # ... HG, HH, MC, PS

org_workstreams:
  - name: Community Wellbeing & Social Resilience (People)
    framework_code: PPP
    framework_category_code: people
    purpose_statement: >
      Track emerging conditions affecting resident wellbeing, service demand,
      and social stability to inform future investments in human-centered services.
    budget_relevance:
      - Homelessness services
      - Rental assistance
      - Public health investments
      - Youth and family programming
      - Equity-focused interventions
    source_preferences:
      categories: ["GOVERNMENT", "RSS"]
      max_sources_per_scan: 25
    scan_budget:
      monthly_token_cap: 500000
      monthly_request_cap: 200
  - name: Climate, Infrastructure & Place-Based Resilience (Place)
    framework_code: PPP
    framework_category_code: place
    purpose_statement: >
      Track environmental, infrastructure, and built-environment trends shaping
      Austin's long-term livability and resilience.
    budget_relevance:
      - Wildfire response / emergency management
      - Storm drain rehabilitation
      - Utility resilience
      - Facility hardening
      - Climate adaptation and mitigation
    # ...
  - name: Intergovernmental & Civic Capacity (Partnerships)
    framework_code: PPP
    framework_category_code: partnerships
    purpose_statement: >
      Track the evolving external ecosystem affecting Austin's ability to govern,
      partner, and deliver services collaboratively.
    budget_relevance:
      - Intergovernmental affairs capacity
      - Regional planning / coordination
      - Grant leveraging
      - Public engagement investments
      - Partnership-based service delivery
    # ...
  - name: Citywide Strategic Plan — FY26–27 Priorities
    framework_code: CSP
    # No category — this workstream tracks all CSP categories.
    top25_priority_ids: "<seeded from canonical Top 25 list>"
    purpose_statement: >
      Track signals against the existing Citywide Strategic Plan priorities
      to enable comparison with the PPP framing for budget and quarterly review.
    source_preferences:
      categories: ["GOVERNMENT", "RSS"]
      max_sources_per_scan: 30
    scan_budget:
      monthly_token_cap: 750000
      monthly_request_cap: 300
```

## 8.1 Quarterly Performance Review (QPR) Surface

The same workstreams must serve quarterly CMO performance reviews, not only the annual budget book. Engineering implication is small if framed correctly:

- **Reuse the existing trend / velocity views.** The QPR view is a per-workstream dashboard that highlights _what changed since last quarter_: card velocity, new-signals count by driver, status transitions on the kanban, and any newly-tagged budget-relevance categories.
- **No new schema.** All inputs already live on cards (timestamps, velocity scores, status changes).
- **One new export.** A "Quarterly Snapshot" PDF/web view that mirrors the _Looking Ahead_ template but uses a quarter-over-quarter delta layout instead of a workstream × focus matrix. Tracked in doc 12 as a v2 export variant.
- **Cadence-aware budgets.** `scan_budget` already has period rollover; a workstream that is part of a QPR cycle can opt into a heavier scan in the two weeks before each quarterly review.

## 9. Sprint Breakdown

### Sprint 1 (May 19 – May 30) — Foundation + cost guardrails

**Backend**

- [ ] Migration `2026_05_20_strategic_frameworks.sql` (tables 4.1–4.4 above).
- [ ] Migration `2026_05_20_workstream_extensions.sql` (table 4.4 + RLS 4.5).
- [ ] `framework_seed.py` and YAML for PPP + CSP frameworks (no drivers yet — driver seed lands in S2).
- [ ] `GET /api/v1/frameworks`, `GET /api/v1/frameworks/{code}`.
- [ ] Extend `WorkstreamCreate` model + `create_workstream` route to accept framework binding.
- [ ] Per-workstream `source_preferences.categories` flowed into `DiscoveryConfig`.
- [ ] `scan_budget` enforcement in `workstream_scans.py` (block + return 429 if over).
- [ ] `GET /api/v1/me/workstreams/{id}/usage`.

**Frontend**

- [ ] "Organization" group on `Workstreams` page.
- [ ] Read-only framework badge + category on workstream header.
- [ ] `WorkstreamBudgetCard` component on the workstream detail page.

**Acceptance**

- A user logs in and sees 4 org workstreams (3 PPP + 1 CSP).
- Each shows its framework + budget card.
- Forcing a scan past budget returns a clear "monthly cap reached" message.

**Effort estimate:** ~7 person-days.

### Sprint 2 (Jun 2 – Jun 13) — Drivers + budget-book export prep

**Backend (drivers half)**

- [ ] Driver YAML seed loaded via `framework_seed.py`.
- [ ] `driver_ids` column on workstreams used in `_filter_cards_for_workstream` (driver search-topic seeds expand keyword matching).
- [ ] `top25_priority_ids` filter wired into `_filter_cards_for_workstream` and into discovery config.
- [ ] `GET /api/v1/frameworks/{code}/drivers` returns drivers grouped by category.

**Frontend (drivers half)**

- [ ] Driver chips on workstream header (collapsible "Tracked metrics" detail).
- [ ] Filter UI: "Show only signals tagged to driver X" on workstream view.

(Budget-book export work in this sprint is described in `12_PRD_Budget_Book_Export.md`.)

**Acceptance**

- Each PPP workstream shows its drivers and tracked-metric examples.
- Filtering by driver narrows the kanban view.
- The CSP workstream filters cards by Top 25 priority overlap.

**Effort estimate:** ~5 person-days for driver scope; budget-book export adds ~3 days.

### Sprint 3 (Jun 16 – Jun 27) — Org workstreams polish + survey readiness

- [ ] `foresight_admins` table + admin gate on org-workstream writes.
- [ ] Admin UI to edit org workstream metadata (description, drivers, source prefs).
- [ ] User can clone an org workstream into a personal copy (preserves filters, isolates budget).
- [ ] Snapshot/preview screenshot generator for the foresight survey.
- [ ] Polish: empty states, error states for budget exhaustion, surfacing of "scan paused" status.

**Effort estimate:** ~5 person-days.

## 10. Risks & Mitigations

| Risk                                                            | Mitigation                                                                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PPP framework canon shifts after Daniel/Jessica sync            | Framework + drivers are data-driven (YAML + DB). A framework rev is a re-seed, not a code change.                                                                               |
| Driver seeds bias discovery toward stale topics                 | Keep `search_topic_seeds` short (≤5 phrases per driver). Review at S3 close with Ana before turning auto-scan on.                                                               |
| Per-workstream budget caps confuse users hitting them mid-month | `WorkstreamBudgetCard` shows projection ("at current rate, you'll hit cap on day X").                                                                                           |
| Org workstreams accidentally edited by non-admins               | RLS policy + UI hides edit controls when `owner_type='org'` and user is not admin.                                                                                              |
| YAML seed runs in prod and overwrites manual admin edits        | Seed function is `INSERT ... ON CONFLICT DO NOTHING` for frameworks/categories/drivers. Org workstreams seeded once and tracked by an `is_seed_of` flag; subsequent runs no-op. |

## 11. Open Questions (mirrors roadmap §5)

1. Org workstreams: shared, or seeded copies per user?
2. Canonical CSP / Top 25 priority list — is this fresh for FY26–27?
3. Is PPP **complementary** to CSP pillars, or eventually **replacing** them?
4. Drivers as structured taxonomy vs. curated keyword lists — confirmed structured?
5. Budget caps — what dollar/token target does Ana want for the 4 org workstreams collectively?

## 12. Telemetry & Success Metrics

- Workstream scan counts per period (per workstream and aggregate).
- Token spend per workstream per period.
- % of scans aborted because of budget cap (target: <5% — caps are calibrated, not punitive).
- Number of cards added to org workstreams per week.
- Stakeholder feedback at S3 close: "Does this give the Strategy & Performance Forum what they need?"
