# Foresight Methodology — From Signals to Scenarios

> **Purpose of this document.** This is a "CliffsNotes" synthesis of the strategic-foresight
> methodology our project lead has asked us to align the Foresight app with. It distills
> three University of Houston / UNDP explainer videos, the UNDP archetype-scenarios material,
> and the canonical academic source (Hines & Bishop, *Framework Foresight*, Futures 2013) into
> a single reference. It then maps that methodology onto the **existing Foresight app**
> (`crypticpy/foresight-app`) so a downstream agent can turn it into concrete build decisions.
>
> **How to use it.** Sections 1–4 are the methodology (the "what" and "why"). Section 5 is the
> gap analysis against the current codebase. Section 6 is the build blueprint — data model,
> API, pipeline, and UI changes — written to be actionable by an implementing agent.

---

## 0. TL;DR for the implementing agent

The methodology our lead follows is **Framework Foresight** (Andy Hines / Peter Bishop,
University of Houston), the same method UNDP teaches. It is a **start-to-finish pipeline**:

```
Domain → Scan (Signals) → Drivers → Baseline Future → Alternative Futures (4 archetypes)
       → Implications → Plans → Leading Indicators
```

Our app today is **excellent at the front of that pipeline** (Domain, Scanning, Signals,
scoring, workstreams) and **stops before the back half**. The methodology's whole payoff —
the part that "informs development decisions" — lives in the back half: **drivers synthesis,
the four archetype scenarios, implications analysis, and leading indicators.**

**The single most important alignment decision:** introduce **Scenarios** as a first-class
object built *from* a workstream's signals, structured around the **four archetypes**
(Baseline/Continuation, Collapse, Discipline/New Equilibrium, Transformation), each carrying
**implications** and **leading indicators** that point back at the signal cards that would
confirm them. Everything else in Section 6 supports that spine.

> ⚠️ **Terminology collision.** The app already has a `drivers` table — but those are
> *taxonomy filter nodes* under the PPP framework (People/Place/Partnerships), **not**
> foresight "drivers of change." Do not overload the existing table. Section 6.1 proposes
> `change_drivers` to keep them distinct.

---

## 1. What strategic foresight is (and is not)

Foresight is **"a structured and systematic way of using ideas about the future to anticipate
and better prepare for change"** (OPM/GSA). Three framing points the videos and UNDP material
hammer repeatedly:

- **It is not prediction.** "In a complex and uncertain world, accurate prediction is a
  fiction." The goal is *preparedness across multiple plausible futures*, not a single forecast.
- **The most likely future is not the only one worth planning for.** (Herman Kahn:
  "The most likely future is not [most likely].") The baseline/expected future is the *least*
  interesting output — it's the reference case against which alternatives are explored.
- **The "4 P's" of futures** scope everything:

  | Type | Meaning |
  |------|---------|
  | **Possible** | It *could* happen |
  | **Plausible** | It *might* happen |
  | **Probable** | It is *likely* to happen (≈ the baseline) |
  | **Preferable** | What we *want* to happen (the vision) |

For a municipal agency (our user, the City of Austin), the practical promise is: surface
emerging change early, pressure-test current plans against several futures, and build resilient
strategy rather than brittle bets.

---

## 2. The Framework Foresight pipeline (the method our lead uses)

Framework Foresight is described by its authors as a **meta-method** — a modular spine into
which other techniques slot. It has **nine steps**, mapping onto the classic six foresight
activities (Framing, Scanning, Forecasting, Visioning, Planning, Acting):

| # | Step | Activity | One-line goal |
|---|------|----------|---------------|
| 1 | **Domain description** | Framing | Bound the topic — "neither too broad nor too narrow." |
| 2 | **Current assessment** | Scanning | Snapshot today: conditions, stakeholders, history (era analysis). |
| 3 | **Baseline future** | Forecasting | The expected, surprise-free default future. |
| 4 | **Alternative futures** | Forecasting | Plausible departures from baseline — the archetypes. |
| 5 | **Preferred future** | Visioning | The aspirational future stakeholders want. |
| 6 | **Implications analysis** | Visioning | "So what?" — consequences of each future. |
| 7 | **Futures to plans** | Planning | Translate implications into options/strategy. |
| 8 | **Leading indicators** | Acting | Signals that tell you which future is arriving. |
| 9 | **Summary** | Acting | Communicable synthesis for decision-makers. |

**Selectivity principle (important for UX & cost):** quality over quantity. The authors
recommend **5–10 items per category** — 5–10 drivers, ~4 scenarios, 5–10 implications each.
Do not let the AI pipeline generate 50 of anything; curation is the value.

**Modularity:** not every project runs all nine steps. Some stop at baseline + alternatives;
some start from existing scenarios and jump to implications. The app should let users **enter
and exit the pipeline at any stage**, not force a linear wizard.

### 2.1 Step detail that matters for the build

- **Domain (Step 1).** Has a *definition*, a *geographic scope* (city/region/global), a
  *time horizon* (a round year that "stands for how much change you'll allow"), and a
  *domain map* of in-scope vs. out-of-scope categories. → In our app this is essentially a
  **Workstream + its scope**. Horizon already exists on cards (short/mid/long).
- **Scanning (Step 2).** Find **signals** — "emerging developments, innovations, shifts in
  society." Collect them in a database; analyze for patterns. Use **STEEP(+V)** lenses:
  Social, Technological, Economic, Environmental, Political (+ Values). → This is **exactly
  what our card/discovery pipeline already does.**
- **Drivers (Step 3 input).** Signals cluster into **drivers of change** — the deeper forces.
  The baseline future is the product of the *expected* trajectory of the key drivers;
  alternative futures come from drivers resolving *differently*. → **New concept for us.**
- **Alternative futures (Step 4).** Built with the **archetype method** (Section 3).
- **Implications (Step 6).** The "Futures Wheel" / implications-wheel technique: for each
  scenario, ask "if this future arrives, what are the 1st/2nd/3rd-order consequences for the
  domain?" Produces "headlines from the future." → **New concept for us.**
- **Leading indicators (Step 8).** For each scenario, define **what early signals would tell
  you this future is materializing.** This is the magic loop: indicators point *back* at the
  kind of signal cards the scanning system collects. → **The integration point** that makes
  the whole app cohere: scenarios generate indicators; the scanner watches for them.

---

## 3. The archetype scenarios (Dator's Four Futures)

Both the UNDP material and the Houston videos build alternative futures from **Jim Dator's
four generic archetypes**. These are the recurring *patterns of change* — every domain can be
imagined along all four. UNDP's naming (left) and the classic naming (right):

| UNDP name | Classic (Dator) | What it explores | Strategic question it answers |
|-----------|-----------------|------------------|-------------------------------|
| **Baseline** | **Continued Growth / Continuation** | Current trends projected forward, no surprises | "What if today's trajectory just continues?" |
| **Collapse** | **Collapse / Breakdown** | Existing systems deteriorate, fail | "What are the risks if challenges go unaddressed?" |
| **New Equilibrium** | **Discipline / Constraint** | Proactive adaptation, restraint, resilience under limits | "What if we deliberately adapt and stabilize?" |
| **Transformation** | **Transformation / New Paradigm** | Fundamental shift via innovation or societal change | "What if the game itself changes?" |

Key teaching points (from the Denise Worrell archetypes video + UNDP):

- The four are **not** predictions and **not** mutually exclusive in reality — Dator's insight
  is that *parts of every system are always growing, disciplining, collapsing, and transforming
  at once.* The archetypes are lenses, not forecasts.
- The archetypes are valuable because they **force teams past the single expected future** and
  surface blind spots — especially Collapse and Transformation, which org cultures avoid.
- A **Preferred future** (Step 5) is layered *on top* — an aspirational scenario stakeholders
  intentionally craft, often blending elements of New Equilibrium and Transformation.

**Build implication:** a Scenario set for a domain should default to these **four archetypes +
an optional Preferred** slot. The archetype is an *attribute* of a scenario, and the UI/AI
should scaffold one of each.

---

## 4. The full method in one diagram

```
                         ┌────────────────────────────────────────────────┐
                         │  STEEP+V lenses applied throughout               │
                         └────────────────────────────────────────────────┘

  [1 DOMAIN]        [2 SCAN]            [3 DRIVERS]         [4 ALTERNATIVE FUTURES]
  Workstream  ───►  Signal cards  ───►  cluster signals ──► 4 archetype scenarios
  + scope           (impact/                into drivers      Baseline / Collapse /
  + horizon          relevance/             (5–10 key          New Equilibrium /
                     velocity…)             forces)            Transformation
                                                                     │
                                                              [5 PREFERRED]
                                                              aspirational future
                                                                     │
                                                                     ▼
  [8 LEADING        [7 PLANS]           [6 IMPLICATIONS]
   INDICATORS] ◄─── strategy/options ◄─ "so what?" per scenario (futures wheel,
   watch for these   to get to/avoid     1st/2nd/3rd-order consequences,
   in the scanner    each future         "headlines from the future")
        │
        └──────────────► feeds back into [2 SCAN]: indicators become saved
                         searches / discovery queries the system monitors
```

The loop from **Leading Indicators back into Scanning** is what turns a one-off foresight
exercise into a **living anticipatory system** — and it's the feature that most differentiates
our app from a static report.

---

## 5. Gap analysis — methodology vs. the current app

Assessed against the cloned repo (`backend/app/`, `docs/04-data-model.md`, the `Methodology`
and `Workstreams` pages).

### 5.1 What the app already does well (Steps 1–2, partial 3)

| Methodology element | Where it lives today | Verdict |
|---------------------|----------------------|---------|
| Domain / framing | Workstreams (+ `owner_type`, scope), card `horizon` | ✅ Strong |
| Signal scanning | `cards` + discovery pipeline (RSS/news/arXiv/.gov/blogs) | ✅ Excellent |
| STEEP-style classification | Pillars (CH/EW/HG/HH/MC/PS), Lens, frameworks | ✅ Adjacent (Austin pillars instead of STEEP, fine) |
| Signal scoring | impact/relevance/velocity/novelty/opportunity/risk + SQI | ✅ Excellent, richer than the method requires |
| Pattern detection | `pattern_insights`, entity graph | ✅ A real driver-synthesis substrate already exists |
| Curation / collaboration | Workstream kanban (inbox→working→ready→archived), portfolios | ✅ Strong |
| Synthesis output | `executive_briefs`, portfolio PDF/PPTX export | ✅ Good Step-9 substrate |

### 5.2 What's missing or mislabeled (Steps 3–8)

| Methodology element | Status today | Gap |
|---------------------|--------------|-----|
| **Drivers of change** | `drivers` table exists but means *taxonomy filter nodes* (PPP), NOT forces of change | ❌ Concept absent; name is taken |
| **Baseline future** | — | ❌ No "expected future" object |
| **Alternative futures / archetypes** | — | ❌ **No scenario object at all.** This is the biggest gap. |
| **Preferred future** | — | ❌ Absent |
| **Implications analysis** | `implications` / `implications_analyses` reference tables seeded but not wired to scenarios | ⚠️ Stub tables exist; no futures-wheel workflow |
| **Plans (futures→strategy)** | — | ❌ Absent |
| **Leading indicators** | — | ❌ Absent — and this is the loop that ties scenarios back to scanning |

### 5.3 Strategic read

The app is **~60% of a Framework Foresight system and ~95% of a horizon-scanning system.**
It nails "signals" and stops at "scenarios" — which is exactly the boundary the project lead's
materials are pushing us across (note the doc title she influenced: *"From Signals to
Scenarios"*). The work is **additive**, not a rewrite: build the scenario spine on top of the
existing signal/workstream foundation.

---

## 6. Build blueprint (for the implementing agent)

Match the codebase's existing conventions: FastAPI + Pydantic models in `backend/app/models/`,
routers under `/api/v1`, Supabase/pgvector with migrations in `supabase/migrations/`, React +
TS feature folders under `frontend/foresight-frontend/src/pages/`. Org-vs-user authz pattern
(404 not 403). Don't `json.dumps()` into JSONB. Use `datetime.now(timezone.utc)`.

### 6.1 Data model (new entities)

All new tables are **scoped to a workstream** (the "domain") and carry RLS like the rest.

```
change_drivers              -- Step 3. The forces, distinct from the taxonomy `drivers` table.
  id, workstream_id, title, description,
  steep_category            -- enum: social|technological|economic|environmental|political|values
  uncertainty               -- low|medium|high  (high-uncertainty drivers shape alt futures)
  impact_level              -- low|medium|high
  embedding vector(1536)
  -- provenance: which signals rolled up into this driver
driver_signals              -- join: change_driver_id ↔ card_id (many-to-many)

scenarios                   -- Step 4/5. The heart of the addition.
  id, workstream_id, title, narrative,
  archetype                 -- enum: baseline|collapse|new_equilibrium|transformation|preferred
  horizon_year              -- the "how much change" year
  is_preferred bool
  status                    -- draft|review|published
  embedding vector(1536)
scenario_drivers            -- join: scenario_id ↔ change_driver_id, with `resolution` text
                               (how this driver "resolves" in this scenario)

implications                -- Step 6. Wire the existing stub table to scenarios.
  id, scenario_id, text, order_level (1|2|3),  -- futures-wheel depth
  pillar (reuse CH/EW/…), opportunity_or_risk, parent_implication_id (for the wheel tree)

scenario_plans              -- Step 7.
  id, scenario_id, title, description, plan_type (toward|avoid|hedge), owner, status

leading_indicators          -- Step 8 + the feedback loop.
  id, scenario_id, description,
  watch_query                -- the saved-search / discovery query that monitors for it
  threshold, current_status (not_seen|early|confirmed),
  linked_saved_search_id     -- ties back into existing `saved_searches`
```

**Reuse, don't reinvent:** `implications` / `implications_analyses` already exist as seeded
reference tables — repurpose/extend rather than create parallel tables. `saved_searches`
already exists — `leading_indicators.watch_query` should create one so the *existing* discovery
machinery does the watching. `pattern_insights` + the entity graph are the natural inputs to
the **driver-synthesis** AI step (don't build clustering from scratch; feed patterns in).

### 6.2 API (new routers, `/api/v1`)

```
# Drivers (Step 3)
POST   /api/v1/workstreams/{id}/drivers/synthesize   # AI: cluster workstream signals → drivers
GET    /api/v1/workstreams/{id}/drivers
PATCH  /api/v1/drivers/{id}                            # human curation (the value-add)

# Scenarios (Step 4/5)
POST   /api/v1/workstreams/{id}/scenarios/scaffold    # AI: generate the 4 archetypes from drivers
GET    /api/v1/workstreams/{id}/scenarios
GET    /api/v1/scenarios/{id}                          # narrative + drivers + implications + indicators
PATCH  /api/v1/scenarios/{id}
POST   /api/v1/scenarios/{id}/preferred                # craft/blend a preferred future

# Implications (Step 6)
POST   /api/v1/scenarios/{id}/implications/generate    # AI: futures-wheel, 1st→3rd order
GET/PATCH/DELETE on implications

# Plans (Step 7) and Indicators (Step 8)
POST   /api/v1/scenarios/{id}/plans
POST   /api/v1/scenarios/{id}/indicators               # creates a linked saved_search
GET    /api/v1/workstreams/{id}/indicators/status      # dashboard: which futures are arriving
```

Long-running AI steps (synthesize/scaffold/generate) follow the **existing worker + `job_events`
pattern** (`JOB_BRIEF` is the template) — return a job id, stream progress to the thread.
Respect `cost_guardrail` and log to `llm_usage_events` (column is `estimated_cost_usd`).

### 6.3 AI pipeline additions

Add three model-backed steps, mirroring `signal_agent_service` / `brief_service` style:

1. **Driver synthesis.** Input: a workstream's cards + `pattern_insights`. Output: 5–10
   `change_drivers` with STEEP category + uncertainty. *Enforce the 5–10 cap* (selectivity
   principle) — prompt and post-filter.
2. **Scenario scaffolding.** Input: the curated drivers (esp. high-uncertainty ones). Output:
   four archetype scenarios, each a short narrative + how each driver "resolves." One of each
   archetype, always.
3. **Implications (futures wheel).** Input: one scenario. Output: 1st-order implications, then
   2nd/3rd-order children, tagged by pillar and opportunity/risk. Cap breadth (5–10 at level 1).

**Guardrails to bake in:** never present scenarios as predictions (UI copy + system prompt);
always generate Collapse and Transformation even when the model "wants" to stay near baseline
(these are the high-value blind-spot futures); keep human curation in the loop at every step
(AI drafts, human edits — matches the kanban philosophy already in the app).

### 6.4 Frontend

- New feature folder `src/pages/Scenarios/` and a **Scenario Workspace** per workstream:
  a board showing the four archetypes side by side (the classic 4-up scenario layout), each
  card expandable into narrative → drivers → implications wheel → indicators.
- A **"Signals → Scenarios" flow** surfaced from the Workstream page: a stepper that walks
  Scan → Drivers → Scenarios → Implications → Indicators, but lets users jump in/out (modularity).
- Extend the existing **Methodology** page (`pages/Methodology/sections/`) with a new section
  explaining Framework Foresight + the four archetypes, so the tool teaches the method it
  embodies (the lead will care about this — it's pedagogical alignment).
- **Indicator dashboard:** "Which futures are arriving?" — reads `leading_indicators.status`,
  driven by the scanner. This closes the loop and is the headline demo feature.
- Extend portfolio/brief **export** to render a full scenario set (Step 9 synthesis) — the
  PDF/PPTX path already exists; add a scenario template.

### 6.5 Sequencing recommendation

1. **`change_drivers` + driver synthesis** (proves the signal→driver lift; low risk, reuses patterns).
2. **`scenarios` + scaffolding** with the four archetypes (the core differentiator).
3. **Implications wheel** wired to the seeded `implications` tables.
4. **Leading indicators + saved-search loop** (the "living system" payoff).
5. **Plans + scenario export + Methodology page section** (polish + Step 7/9).

Ship 1–2 first and demo to the lead to confirm the methodology interpretation before building
the back half.

---

## 7. Source map (provenance)

| Source | What we took from it |
|--------|----------------------|
| Mina McBride, *Identifying Key Drivers of Change* (UH/UNDP, YT `uS2BUX_sEGU`) | Drivers as the bridge from signals to scenarios (Step 3). |
| Denise Worrell, *Archetypal Scenarios Explained* (UH/UNDP, YT `EJ-6fvdpdAk`) | The archetype method; "recurring patterns of change"; not predictions. |
| Dr. Andy Hines, *Signal Scanning for Foresight* (UH/UNDP, YT `RRn95OTqD7Q`) | Signals = emerging developments/innovations/shifts; scanning as foundational input. |
| UNDP, *Creative Approach — Archetype Scenarios* + UNDP Evaluation *Scenarios* | Four archetypes (Baseline/Collapse/New Equilibrium/Transformation); key-drivers framing; preferred future. |
| Hines & Bishop, *Framework Foresight* (Futures 51, 2013) | The canonical nine-step method, selectivity principle, domain/era/baseline detail. |
| GSA CoE, *Strategic Foresight 101* | 5-step process restatement, STEEP+V, 4 P's, implications wheels / backcasting. |
| `crypticpy/foresight-app` repo | Current architecture & the gap analysis in Section 5. |

> Video transcripts could not be pulled verbatim from this environment (YouTube blocks
> datacenter IPs); the substance above is reconstructed from each video's official description
> + the underlying published method, which the videos are explicitly teaching. If you want the
> exact wording captured, paste the transcripts (YouTube → ⋯ → Show transcript) and this doc
> can be tightened with direct quotes.
