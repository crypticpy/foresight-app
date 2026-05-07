# PRD: "Looking Ahead" Budget-Book Page Export

**Version:** 0.2 (Draft for Review)
**Date:** 2026-05-06
**Status:** Planning — no code yet
**Source brief:** Ana DeFrates email thread, May 4 2026
**Roadmap parent:** `10_FY26_FORESIGHT_ROADMAP.md`
**Companion:** `11_PRD_Scoped_Workstreams_and_Frameworks.md`
**Target sprint:** S2 (Jun 2 – Jun 13); v2 QPR variant in S3.

---

## 1. Problem

Ana's brief asks Foresight to produce a **"Looking Ahead: Strategic Foresight in Budget Planning"** page suitable for the _approved_ City of Austin budget book. Her brief includes the literal target layout: a 3-row table titled _Looking Ahead: Strategic Foresight in Budget Planning_ with columns **Workstream | Key Focus | Example Signals Being Tracked**, populated by the three PPP workstreams. CSP is _not_ in her sample table — the email proposes CSP as an additional fourth workstream Foresight should _track_, but the budget-book page itself is PPP-only.

Two tensions follow:

1. **"Looking Ahead" page = PPP-only matrix (3 rows).** This is the canonical budget-book deliverable and matches Ana's sample.
2. **A broader "Foresight Companion" matrix (4 rows = PPP + CSP)** is useful for internal audiences and the Strategy & Performance Forum, where CSP context is valuable.

We support both — same backend service, two render presets.

The deliverable is structurally a **matrix**:

- **Rows** — workstreams (3 for the budget-book preset; 4 for the companion preset).
- **Columns** — focus areas / drivers within each workstream (per-workstream column count).
- **Cells** — example signals already tracked by Foresight that illustrate the focus area.

Today, Foresight produces high-quality narrative briefs and per-card CSV exports (`backend/app/export_service.py`, `backend/app/brief_service.py`), but no structured cross-workstream matrix and no print-ready single-page layout suitable for the budget book.

## 2. Out of Scope

- Auto-publishing to the actual budget book CMS. We deliver a print-ready PDF and an embeddable web view; budget staff handle the final paste.
- Climate map embedding on the page. The first cut of _Looking Ahead_ is text-and-table only. Once the climate overlay (`13_FEATURE_Climate_Overlay.md`) ships, we can revisit adding a small risk-map thumbnail.
- AI rewriting of signal summaries to budget-book voice. Initial export uses the existing card `summary` field; a "tone pass" with Ana's editorial voice is a v2 enhancement.

## 3. Target State (end of S2)

A user with access to the four PPP/CSP workstreams clicks _Export → Looking Ahead Page_ on the workstreams index. Foresight:

1. Calls a new endpoint that aggregates the user's selected workstreams.
2. For each workstream, returns the top _N_ cards per driver (default N=2), ranked by composite score.
3. Renders a **single-page, single-table PDF** with a Foresight + City of Austin masthead, a workstream-by-driver matrix, and a footer citing the source date and signal count.
4. Optionally returns the same data as **structured JSON** so budget staff can paste into their book template.
5. Optionally renders the matrix as a **web preview** at `/budget-book/looking-ahead` for in-app review before download.

## 4. Wire-frame (text)

```
+-----------------------------------------------------------------------+
| FORESIGHT — Looking Ahead: Strategic Foresight in Budget Planning     |
| City of Austin · FY26–27 Budget Book Companion                        |
| Generated 2026-06-12 from 4 workstreams · 142 active signals          |
+-----------------------------------------------------------------------+
| Workstream            | Focus               | Example Signals          |
|-----------------------|---------------------|--------------------------|
| People — Wellbeing &  | Cost of Living      | • Eviction filings up 12%|
| Social Resilience     |                     | • Rental aid demand +18% |
|                       | Behavioral Health   | • BH workforce shortage  |
|                       |                     | • Shelter waitlist 230   |
|                       | Equity Expectations | • Trust score declining  |
|-----------------------|---------------------|--------------------------|
| Place — Climate &     | Climate Change      | • 73 days >100°F (proj)  |
| Infrastructure        |                     | • Wildland-urban risk    |
|                       | Aging Infrastructure| • Stormwater incidents↑  |
|                       | Energy Transition   | • EV charging gap        |
|-----------------------|---------------------|--------------------------|
| Partnerships — Civic  | Preemption          | • TX Lege session impacts|
| Capacity              | Regional            | • CapMetro interlocal    |
|                       | Grants              | • IIJA round 4           |
|-----------------------|---------------------|--------------------------|
| Citywide Strategic    | Top-25 priorities   | • <signal A> · <signal B>|
| Plan (CSP)            |                     | • <signal C> · <signal D>|
+-----------------------------------------------------------------------+
| Footer: methodology link · feedback contact · Foresight version       |
+-----------------------------------------------------------------------+
```

## 5. Backend Design

### 5.1 New service: `LookingAheadService`

File: `backend/app/services/looking_ahead_service.py`

Responsibilities:

1. Given a list of workstream IDs, fetch each workstream + its bound framework + drivers.
2. For each (workstream, driver) pair, query the top-N cards by composite score where the card matches the driver via:
   - direct `driver_ids[]` overlap on the workstream → card link table, OR
   - keyword overlap with driver `search_topic_seeds`, OR
   - `top25_relevance` overlap (for CSP workstream rows).
3. Compose a `LookingAheadMatrix` Pydantic model:

   ```python
   class LookingAheadCell(BaseModel):
       card_id: str
       title: str
       summary: str             # ≤140 chars, truncated
       url: Optional[str]
       composite_score: float

   class LookingAheadFocus(BaseModel):
       driver_code: str
       driver_name: str
       cells: list[LookingAheadCell]

   class LookingAheadRow(BaseModel):
       workstream_id: str
       workstream_name: str
       framework_label: str     # 'People', 'Place', 'Partnerships', 'CSP'
       focuses: list[LookingAheadFocus]

   class LookingAheadMatrix(BaseModel):
       generated_at: datetime
       generated_by: str
       workstream_rows: list[LookingAheadRow]
       signal_count_total: int
       methodology_url: str
   ```

### 5.2 New endpoint: `POST /api/v1/me/exports/looking-ahead`

Request body:

```json
{
  "workstream_ids": ["uuid-1", "uuid-2", "uuid-3", "uuid-4"],
  "format": "pdf" | "json" | "html",
  "preset": "budget_book" | "companion" | "qpr_snapshot",
  "signals_per_focus": 2,
  "include_budget_relevance_footer": true,
  "include_strategic_rationale": true
}
```

**Presets** (only the row-set and copy differ; aggregation is the same):

| Preset                  | Rows                                                           | Header                                                  | Use case                                                        |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| `budget_book` (default) | PPP only (3 rows)                                              | "Looking Ahead: Strategic Foresight in Budget Planning" | The approved-budget-book companion page (matches Ana's sample). |
| `companion`             | PPP + CSP (4 rows)                                             | "Foresight Companion — FY26–27"                         | Internal Strategy & Performance Forum briefings.                |
| `qpr_snapshot`          | Caller-selected workstreams, quarter-over-quarter delta layout | "Quarterly Foresight Snapshot — Q{N} FY{YY}"            | Quarterly performance review with CMO. v2 — see §11.            |

**Boilerplate copy** that ships with `budget_book` preset (taken from Ana's brief, lightly edited):

> _"To support long-term fiscal sustainability and proactive planning, the City monitors emerging trends, drivers of change, and weak signals across three strategic foresight workstreams."_

Optional **strategic rationale footer** (toggle: `include_strategic_rationale`) renders Ana's "Why This Works Strategically" bullets verbatim:

- Connects budget decisions to future conditions, not just current operations
- Creates a durable structure for annual horizon scanning
- Makes foresight legible and actionable for budget stakeholders
- Helps justify proactive / preventative investments
- Integrates with milestone / KPI development over time

When `include_budget_relevance_footer=true`, each workstream row gets a small italic line below its name, listing the workstream's `budget_relevance[]` array — the anticipated investment categories its signals inform (e.g., _"Informs: homelessness services, rental assistance, public health investments…"_). This is the bridge from scanning to budgeting and is the single most stakeholder-relevant addition.

Response:

- `format=pdf` — `application/pdf` stream, filename `looking-ahead-{preset}-{date}.pdf`.
- `format=json` — `LookingAheadMatrix` JSON for downstream tooling.
- `format=html` — server-rendered HTML for the in-app preview view.

### 5.3 PDF rendering

The existing `export_service.py` already uses **ReportLab** for PDF + matplotlib for charts. We extend it with a `looking_ahead_pdf.py` module:

- Page size: US Letter, landscape, 0.5" margins.
- Single page hard limit. If signals overflow, truncate cells (most-recent-N) and add a footnote.
- Typography matches existing brief PDF (`brief_service.py` PDF templates) for visual consistency.
- Foresight + City of Austin logo placement matches the existing executive brief masthead.
- Generated by ReportLab `Table` flowable with column widths fitted by the `framework_label` ranges.

### 5.4 HTML preview view

Add a thin React route at `/budget-book/looking-ahead` that fetches `format=html` (or fetches `format=json` and renders client-side with the same styling). This route is the in-app review surface — no print CSS required because the PDF is the print artifact.

## 6. Frontend Design

| Area                                               | Change                                                                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pages/Workstreams.tsx`                            | Add a top-bar "Export Looking Ahead Page" button visible when ≥1 PPP/CSP workstream is selected.                                                                         |
| New: `components/LookingAheadExportModal.tsx`      | Modal with workstream multi-select (default = all org workstreams), `signals_per_focus` slider (1–4), format radio (PDF/JSON/HTML preview), generated-by signature line. |
| New: `pages/LookingAheadPreview.tsx`               | Renders the `LookingAheadMatrix` JSON as the matrix table; "Download PDF" button at the top.                                                                             |
| `lib/discovery-api.ts` or new `lib/exports-api.ts` | `postLookingAheadExport(payload)`.                                                                                                                                       |

## 7. Driver-to-Focus Mapping

The "Focus" column in the table is the driver `name` (e.g., _Cost of Living_). Drivers come from the framework taxonomy in `11_PRD_Scoped_Workstreams_and_Frameworks.md` §4.3. For the CSP workstream specifically, focuses are the framework categories (CSP pillars CH/EW/HG/HH/MC/PS) since CSP doesn't ship with curated drivers in S1/S2.

This means the budget-book export depends on the driver registry from S2 of doc 11. The two work items are deliberately scheduled into the same sprint.

## 8. Sprint Breakdown

This entire PRD targets **S2 (Jun 2 – Jun 13)** and assumes drivers are seeded earlier in S2 per `11_PRD_Scoped_Workstreams_and_Frameworks.md` §9.

**Backend (≈3 days)**

- [ ] `LookingAheadService` aggregator + composite ranking.
- [ ] `POST /api/v1/me/exports/looking-ahead` route + PDF rendering.
- [ ] Tests: small fixture matrix, JSON snapshot, PDF byte-size sanity.

**Frontend (≈2 days)**

- [ ] `LookingAheadExportModal` + `pages/LookingAheadPreview` route.
- [ ] Wire workstream multi-select + format radio.
- [ ] Loading/error states for long renders.

**Total:** ~5 person-days, fitting comfortably inside S2 alongside the driver work.

## 9. Acceptance Criteria

1. Logged in as Ana, with the four org workstreams visible, _Export Looking Ahead Page_ renders a single-page landscape PDF in <10s.
2. The PDF table contains 4 rows (3 PPP + 1 CSP), each with 3–5 focus rows, each focus showing 2 example signals with title + truncated summary + composite score.
3. JSON output passes a schema check matching `LookingAheadMatrix`.
4. The HTML preview at `/budget-book/looking-ahead` matches the PDF visually (same row order, same signal selection).
5. If a workstream has no signals for a driver, that focus row reads "_No signals tracked yet_" and does not break the layout.
6. The export honors the `FORESIGHT_DEMO_FREEZE` flag — no LLM calls happen during export. (Composition is deterministic; signals are read from existing tables.)

## 10. Risks & Mitigations

| Risk                                                         | Mitigation                                                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Single page can't hold 4 workstreams × N drivers × 2 signals | Default `signals_per_focus=2` and cap rows-per-workstream at 5; truncation is explicit and footnoted.                   |
| Card summaries are too long for table cells                  | Truncate at 140 chars with ellipsis and link out to full card on the web preview.                                       |
| Budget book editorial voice differs from card summaries      | v1 keeps card summaries verbatim; v2 adds an LLM "tone pass" (out of scope here).                                       |
| Stakeholder asks for color-coded risk indicators             | Add a "Velocity" mini-arrow column in v2 (we already track velocity score on cards). Out of scope for first cut.        |
| Methodology link points to a doc that doesn't exist yet      | Ship a tiny `/docs/foresight-methodology.html` static page or link to this PRD until the public methodology page lands. |

## 11. Open Questions

1. Format: print-ready PDF only, or also DOCX for budget staff edits?
2. Logo set: City of Austin seal + Foresight wordmark, or only one?
3. Is the page intended for the **published** budget book, or for an internal _companion_ document the budget book references? Affects branding constraints.
4. Should the export include a **"As of"** date that indicates the most recent signal, or a fixed generation timestamp?
5. Should the JSON/HTML preview be share-by-link (read-only token) so Ana can send a preview before downloading? (Lightweight feature; ~0.5 day if wanted.)

## 12. Future Extensions (post-S2)

- **AI tone pass** — rewrite each cell summary in the budget-book voice, gated behind an `editorial_voice` template.
- **Multi-page** — when 6+ frameworks/workstreams exist, allow a multi-page export with one workstream per page.
- **Climate map thumbnail** — once `13_FEATURE_Climate_Overlay.md` ships, embed a small risk-by-tract thumbnail in the Place row.
- **Signal trajectory sparklines** — small inline sparkline per cell using card velocity history.
