# FY26 Foresight Roadmap — Stakeholder Brief Response

**Version:** 0.2 (Draft for Review)
**Date:** 2026-05-06
**Authors:** Foresight engineering
**Source brief:** Ana DeFrates email thread, May 4 2026 (subject: "AI & Strategic Foresight Demo")
**Stakeholders on the thread:**

- **Ana DeFrates** — Business Process Consultant Sr, Austin Budget & Organizational Excellence (driving stakeholder)
- **Christopher Collins** — AI Technology Lead, Austin Public Health (Foresight project lead)
- **Megan Bell** — City of Austin
- **Charles Purma III** — City of Austin
- **Daniel Culotta** — City of Austin (looped in to potentially sync with Jessica Ferrari for FY26–27 CMO framing)
- **Heather Benoit** — thinklangrand.com (external consultant cc'd)
- **Jessica Ferrari** — referenced (not on thread); potential source of FY26–27 high-level framing ("tightening our belts")

**Companion documents:**

- `11_PRD_Scoped_Workstreams_and_Frameworks.md`
- `12_PRD_Budget_Book_Export.md`
- `13_FEATURE_Climate_Overlay.md`

---

## 1. Purpose

Ana's May 4 brief asked Foresight to support **two related decision-making cycles** — the **FY26–27 budget book** _and_ **quarterly performance reviews with CMO** — by aligning scanning to the City Manager's Office "People · Place · Partnerships" (PPP) framing from page 15 of the current budget message. The app has been idle since early 2026; Ana's commitment was direct ("we will not let it sit idle again"), so reactivation has to deliver visible value while preventing the prior idle-burn cost pattern.

The brief contains five engineering-relevant asks (§2). Two more contextual notes shape sequencing:

- **The PPP framing originated from Ana's ChatGPT working session**, not from a published CMO doc. It is a strong proposal but explicitly refinable as Daniel Culotta potentially syncs with Jessica Ferrari on the emerging FY26–27 framing. Our framework taxonomy must therefore be **data-driven, not hard-coded** (§4 of doc 11).
- **Ana's CSP-centered foresight survey** (going to the Strategy & Performance Forum — financial managers and strategy leads) has not yet been sent. Survey results will land mid-S2 / S3 and should feed back into driver curation. We treat this as a content-feedback loop, not a code change.

This document is the index. Each work item is detailed in a companion PRD or feature plan.

## 2. Stakeholder Asks → Engineering Items

| #   | Ask (paraphrased)                                                                                                                                                                                                                                   | Engineering item                                                                                              | Doc                                                                                       | Sprint(s) |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------- |
| 1   | Three workstreams aligned to People · Place · Partnerships, each with curated drivers and tracked metrics                                                                                                                                           | Strategic-framework taxonomy + seeded PPP workstreams + driver registry                                       | [11](./11_PRD_Scoped_Workstreams_and_Frameworks.md)                                       | S1, S2    |
| 2   | An additional workstream that tracks the Citywide Strategic Plan (CSP) priorities                                                                                                                                                                   | CSP-as-framework + CSP-priority filter on workstreams                                                         | [11](./11_PRD_Scoped_Workstreams_and_Frameworks.md)                                       | S1        |
| 3   | Climate projection data overlay (future-flagged, not for current testing window)                                                                                                                                                                    | Multi-sprint climate-overlay feature; open-source foundation, ESRI-forward architecture                       | [13](./13_FEATURE_Climate_Overlay.md)                                                     | S5–S9     |
| 4   | "Looking Ahead: Strategic Foresight in Budget Planning" budget-book page export                                                                                                                                                                     | Workstream × focus × example-signals matrix export                                                            | [12](./12_PRD_Budget_Book_Export.md)                                                      | S2        |
| 5   | Manage costs by scoping scanning to focused workstreams (no idle-burn repeat) — Ana's framing: workstream-scoping _is_ the cost-control mechanism                                                                                                   | Per-workstream source preferences + scan budgets + global freeze switch already shipped                       | [11](./11_PRD_Scoped_Workstreams_and_Frameworks.md), §6                                   | S1        |
| 6   | Workstreams must serve **two consumption surfaces** — the FY26–27 budget book _and_ quarterly performance reviews with CMO                                                                                                                          | Same scoped workstreams; export templates differ (budget book = matrix; QPR = trend/velocity dashboard view)  | [11](./11_PRD_Scoped_Workstreams_and_Frameworks.md), [12](./12_PRD_Budget_Book_Export.md) | S2, S3    |
| 7   | Each PPP workstream carries explicit **Budget Relevance** — anticipated investment categories the workstream's signals inform (e.g., wildfire response, rental assistance, grant leveraging)                                                        | New `budget_relevance[]` field on workstreams; surfaced in UI and budget-book footer                          | [11](./11_PRD_Scoped_Workstreams_and_Frameworks.md), §4                                   | S1        |
| 8   | Climate overlay must integrate with **departmental performance data** (safety ratings, code compliance, incident lists, asset inventories, demand-growth models) — Ana's recent climate adaptation project used these alongside climate projections | Performance-data layer concept in addition to risk-data layer; both joinable to workstream cards by geography | [13](./13_FEATURE_Climate_Overlay.md), §4–5                                               | S7–S8     |

## 3. Sprint Plan

Each sprint is two calendar weeks. Sprint sizing assumes **one engineer at ~70% allocation** plus design/content review from Ana's group. If that allocation changes, multiply.

| Sprint | Window (target) | Goal                                                 | Primary deliverables                                                                                              |
| ------ | --------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **S1** | May 19 – May 30 | Reactivation, scoping, CSP & PPP workstreams shipped | Framework taxonomy migration · seeded PPP + CSP workstreams · per-workstream source-preferences · cost guardrails |
| **S2** | Jun 2 – Jun 13  | Drivers + budget-book export ready for Ana's review  | Driver registry · workstream × focus matrix endpoint · `/looking-ahead` PDF template · in-app preview             |
| **S3** | Jun 16 – Jun 27 | Polish + Strategy & Performance Forum readiness      | Org-level (shared) workstreams · CSP priority filter UX · feedback loop with Ana's foresight survey               |
| **S4** | Jun 30 – Jul 11 | (Buffer / hold) — climate sprint readiness audit     | Climate overlay Sprint-0 spike: dataset audit + architecture decision record                                      |
| **S5** | Jul 14 – Jul 25 | Geospatial foundation (open source)                  | PostGIS enabled · `/geo/*` API contract · MapLibre map shell · admin-boundary reference layer                     |
| **S6** | Jul 28 – Aug 8  | First climate dataset live                           | Atlas 14 flood overlay (open data) · workstream → census-tract join · risk-tile rendering                         |
| **S7** | Aug 11 – Aug 22 | Second dataset + risk scoring                        | EDF Climate Vulnerability Index by tract · per-card risk score · filter UX                                        |
| **S8** | Aug 25 – Sep 5  | Multi-layer composition + briefs                     | Layer-toggle UI · climate context section in card briefs · printable map for `/looking-ahead`                     |
| **S9** | Sep 8 – Sep 19  | ESRI bridge (when access granted)                    | ArcGIS REST adapter · ArcGIS Online vector-tile layer support · ArcGIS Enterprise migration runbook               |

S5–S9 dates are aspirational and gate-controlled — see §6 below.

## 4. Sequencing Rationale

The order is driven by three constraints:

1. **Cost containment first.** S1 ships per-workstream source preferences and scan budgets so reactivation does not recreate the Q1 idle-burn pattern. The recently-shipped `FORESIGHT_DEMO_FREEZE` flag (`6cb527b`) is the global stop; S1 adds the per-stream throttle that lets us actually run scans without panic.
2. **Framework before drivers before export.** The budget-book matrix (S2) has rows = workstreams, columns = drivers/focus, cells = signals. S1 must give us the rows and S2's first half must give us the columns before the export template is meaningful.
3. **Climate is a phase-shift.** It is the only ask that adds a new technical stack (PostGIS, map tiles, raster handling). Putting it after the budget cycle's first delivery (S1–S3) keeps stakeholder confidence high while the geospatial foundation is built. S4 is a deliberate buffer for a Sprint-0 spike before any code lands.

## 5. Open Decisions for Ana / CMO

These should be answered before S1 closes, in priority order:

1. **Workstream ownership model.** Are PPP and CSP workstreams _org-level_ (shared, governed) or _seeded copies per user_? Affects RLS, scan-cost accounting, and whether S3 must ship shared workstreams.
2. **CSP priority list.** The `top25_priorities` table (`supabase/migrations/001_complete_schema.sql:48`) holds the prior CMO Top 25. Is the FY26–27 list the same, or is there a refresh expected from Jessica Ferrari? S2 needs the canonical list to wire the filter.
3. **PPP framework canon.** The workstream descriptions in this roadmap use Ana's brief verbatim. Should the framework taxonomy treat PPP as **complementary** to CSP pillars (both visible) or **primary** (PPP for FY26 budget book; CSP retained for legacy filters)?
4. **Driver granularity.** Treat drivers as a structured taxonomy (e.g., `Cost of Living`, `Aging Infrastructure`) with their own DB rows, or as curated keyword lists per workstream? Structured drivers cost ~3 extra days in S2 but enable cross-workstream reporting.
5. **Budget-book deliverable format.** Is the _Looking Ahead_ page consumed as **print-ready PDF**, **embeddable web view**, or **structured data the budget team copies**? Determines S2's template scope.
6. **Climate overlay greenlight.** Is S5 conditional on Ana's testing milestone, on enterprise-GIS access landing, or on calendar? See §6.
7. **Quarterly performance review (QPR) format.** Is the QPR view a separate dashboard, a different export of the same matrix, or a Foresight chat session preset? Affects whether S3 needs a new view or just an export variant.
8. **Performance-data layer scope.** The climate overlay reference list includes departmental operational data (safety ratings, code compliance, incident lists, asset inventories, demand-growth models). Are these City-internal feeds we will get access to, or representative examples? Determines whether S7–S8 builds an internal-data ingestion path or stays on open-data layers.
9. **Survey feedback integration.** Ana's CSP foresight survey to the Strategy & Performance Forum has not yet been sent. Should we hold S3 until results are in (so survey-identified drivers can seed v2), or push S3 and absorb a re-seed later?

## 6. Climate Overlay — Greenlight Gates

The brief explicitly defers the climate overlay until current testing concludes. We treat this as a hard gate. Each gate must be cleared before the next sprint starts:

- **Gate G0 → S4 spike:** Stakeholder confirms current testing window is closed and overlay work can begin.
- **Gate G1 → S5 build:** Architecture decision record (S4) reviewed by Ana + AI Tech Lead. Open-source dataset for first overlay (Atlas 14 vs. EDF CVI vs. Austin digital twin) is selected.
- **Gate G2 → S9 ESRI bridge:** Enterprise GIS / ArcGIS Online credentials provisioned to the project; ESRI partnership engagement (if any) is scoped. Without G2, S9 slips and we ship more open-source layers in its place.

The architecture in `13_FEATURE_Climate_Overlay.md` ensures no work done in S5–S8 has to be thrown away when ESRI access lands. We choose OGC-standard interfaces, schema-compatible storage (PostGIS as the enterprise geodatabase ArcGIS already supports), and a map-rendering library with an ESRI plugin path. This is the single most important architectural decision in the roadmap and is documented in detail in doc 13.

## 7. Operating Principles for the Reactivation

These apply across all sprints and exist because of the Q1 idle-burn lesson:

1. **No automatic spend by default.** A new workstream is created with `auto_scan = false`. Auto-scan can be turned on per-workstream and respects per-workstream budget caps.
2. **Every sprint ends with a user-visible deliverable Ana can click.** No infrastructure-only sprints. (S5 is the closest to infra-only and ships a visible map shell with reference layers.)
3. **Open data first; proprietary data behind a flag.** Climate overlay defaults to open-data sources (NOAA, USGS, EPA, EDF, Census). ESRI and other licensed sources sit behind feature flags so we can demo without them.
4. **Schema decisions favor extensibility over speed.** PPP and CSP are specific instances of a general "strategic framework" pattern. We build the general pattern in S1.
5. **Document architecture decisions as ADRs in `docs/adr/`.** The climate overlay introduces enough ADRs (PostGIS-vs-Spatialite, MapLibre-vs-Leaflet, vector-tile-vs-WMS, ESRI-bridge approach) that we should start a real ADR log.

## 8. What This Roadmap Does _Not_ Cover

- Ana's foresight survey to the Strategy & Performance Forum is product-content work, not engineering. We will support it with seed data and a workstream preview screenshot if asked.
- Daniel Culotta's potential sync with Jessica Ferrari for FY26–27 framing is upstream of this roadmap. If new high-level themes ("tightening our belts") emerge, we update the framework taxonomy in S1 — that's why the taxonomy is data-driven, not hard-coded.
- Peer-city benchmarking, grant matcher, and other items from `prd-novel-features.md` are explicitly out of scope for this reactivation. They remain on the longer-term backlog.

## 9. Success Criteria

The reactivation is successful when, by the end of S3:

- Ana can open Foresight, see four pre-seeded workstreams (three PPP + one CSP), and trust that their signals are scoped and budgeted.
- The Strategy & Performance Forum receives an export PDF that can drop into the budget book _Looking Ahead_ page.
- Monthly Foresight spend during reactivation is <$X (target to be set with Ana before S1).
- Climate overlay has a credible Sprint-0 spike output the team is ready to commit to.

The climate overlay is successful when, by the end of S8:

- One open-data climate layer is overlaid on at least one PPP workstream's signals.
- A test user can answer "which census tracts have both [signal X] and [risk layer Y]" without leaving Foresight.
- The architecture passes a 1-hour ESRI-compatibility review (informal — no ESRI work has shipped yet).
