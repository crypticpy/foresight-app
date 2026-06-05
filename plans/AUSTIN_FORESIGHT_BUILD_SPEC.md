# Austin Foresight — Build Spec: From Signals to Scenarios

> **What this is.** The implementing-agent companion to the client-facing memo
> `docs/Austin_Foresight_From_Signals_to_Scenarios.docx` (prepared for Ana DeFrates and the
> Strategy & Performance Foresight team). It reconciles **two inputs**:
>
> 1. **The client's actual design** — the scenario/workstream model Chris proposed to Ana,
>    grounded in her 90-day work plan, the "14 Drivers of Change" study, and the ABAG
>    external-forces scenario table she shared.
> 2. **The reference methodology** — Framework Foresight (UH/UNDP) + Dator's four archetypes,
>    captured in `plans/FORESIGHT_METHODOLOGY.md`.
>
> Where the two diverge, **the client design wins** — it is deliberate and specific. This doc
> flags those divergences so they're conscious choices, not drift. It is the source of truth
> for what to build; the methodology doc is background.
>
> **STATUS: both open questions are now RESOLVED by Ana (see §0).** This spec reflects her
> decisions. Earlier drafts of §0/§3/§4 that hedged on these points are superseded.

---

## 0. Two decisions Ana made — now locked

Ana DeFrates resolved the two questions this spec was gated on. Build to these.

### Decision 1 — What a driver is: **a theme informed by a collection of signals.**
> *"I'm going to call it and say they should be themes that are informed by a collection of
> signals, rather than a tag."*

A driver is **not** a tag on a single signal. It is a **cross-cutting theme** the tool surfaces
by grouping related signals (via AI pattern detection) across workstreams. **Driver-themes are
the building blocks of scenarios.** This confirms the model the rest of this spec assumes —
build `driver_themes` per §4.3; do **not** reuse the placeholder one-word classification or the
existing PPP `drivers` taxonomy table.

### Decision 2 — Scenarios follow the **archetype process**, reduced to **three**: Baseline, Collapse, Desired.
> *"The archetypal scenario development process is a standard way of mapping scenarios that we
> would lean into (however we might only do baseline, collapse and desired)."*

This **partially reverses the earlier "build the composer, not archetypes" call.** Ana wants the
**Dator/UNDP archetype frame** — but a **3-scenario set**, not four:

| Scenario | Dator/UNDP archetype | The question it answers for Austin |
|----------|----------------------|-------------------------------------|
| **Baseline** | Continued Growth / Continuation | "What if current trends just continue?" |
| **Collapse** | Collapse / Breakdown | "What are the risks if challenges go unaddressed?" |
| **Desired** | Preferred Future (aspirational) | "What does Austin want to steer toward?" |

> Note she **drops** the third/fourth archetypes (Discipline/New Equilibrium and Transformation)
> in favor of an explicit **Desired** (preferred) future. That's a deliberate simplification for
> the CMO conversation — three clear futures, not four abstract ones.

### How the two decisions reconcile with the composer (the key synthesis)

The **scenario composer** (Emphasis Blend dials, "Where Emphasis Shifts" gauges, receipts) is
**not discarded** — it becomes **the engine for authoring each of the three archetype
scenarios.** Concretely:

- The **archetype** (Baseline / Collapse / Desired) is now a **required attribute** of a
  scenario — the team always produces this set, in this order.
- Within each archetype, Ana still uses the **driver-theme emphasis dials** to compose *how that
  future plays out* — e.g. the Collapse scenario is built by dialing the relevant driver-themes
  toward their downside; the Desired scenario by dialing toward Austin's preferred resolution.
- So: **archetype = the frame (which of the three futures); composer = the authoring mechanic
  (how that future is shaped from driver-themes, with evidence).** Both are true at once. The
  earlier "mixing board, not multiple-choice" framing is amended to **"a guided mixing board,
  one pass per archetype."**

And the framing printed on the mock-up holds across all three: **"decision-support, not a
forecast"** — "a fuel gauge for attention and funding, not a prediction." Enforce in UI copy and
system prompts.

---

## 1. The customer and the constraints (why the design is shaped this way)

- **Customer:** Ana DeFrates (strategist/lead) + analysts Raju, Brittanie, Endurance — the
  City of Austin Strategy & Performance **Foresight team**.
- **Their cadence:** weekly review meetings → monthly synthesis → **quarterly "Future
  Conditions & Emerging Risks" briefing for the CMO.** This cadence is the spine the tool
  serves.
- **The hard constraint that drives everything:** each analyst has **1–3 hours/week** for this
  work. Therefore the governing principle is **"AI proposes, people decide"** — AI does all the
  preprocessing (summary, scores, draft tag, enrichment); the scarce human hour goes purely to
  *judgment* (accept / override / annotate). This isn't philosophy, it's survivability. And it
  makes output **defensible**: a named analyst stands behind every call, not a black box.
- **Org structure → tool structure:** one **workstream per CSP strategic priority**, each owned
  by a Budget & Performance Consultant. The six CSP workstreams should be **pre-built and
  assigned** so the team starts in a populated tool, not an empty one.

---

## 2. The five-level model (the client's mental model — build to this)

This is the architecture Ana signed up for. Map every feature to one of these levels.

```
1. SIGNALS        Continuous scan of the outside world. AI first pass on each:
                  plain-language summary, scores, DRAFT classification. "Nothing arrives blank."

2. WORKSTREAMS    One per CSP priority, analyst-owned, keyword-targeted. THE human work layer:
                  review → confirm/override tag → annotate → research → move across board
                  (inbox → working → ready). One signal can live in multiple workstreams.

3. AREA BRIEF     AI brief generated over an analyst's CURATED (ready) workstream signals.
                  Their area's story, ready to present.

4. CITYWIDE       When a signal is marked "ready" it surfaces to Ana's roll-up across all six
   ROLL-UP        workstreams. She pulls what matters most into a PORTFOLIO (already spans
                  workstreams). That portfolio feeds the scenarios + the quarterly briefing.

5. SCENARIOS      Cross-cutting drivers that surface across priorities become inputs to
                  scenarios — composable "what-if" blends Ana assembles for leadership.
                  (Strategist-gated — Ana's role.)
```

Two zoom levels of **the same machine**: an Area Brief is one workstream; the quarterly
briefing is the whole city. **Only the citywide roll-up view is genuinely new** — briefs and
portfolios already exist and get *re-templated*, not rebuilt.

---

## 3. The vocabulary decision (RESOLVED)

The memo asked Ana the one question that gated everything:

> **"What is a driver?"** Is it (a) a **tag on a single signal**, or (b) a **theme that groups
> many signals** across workstreams?

✅ **Ana chose (b): a driver is a theme informed by a collection of signals**, not a tag. The
tool surfaces driver-themes via AI pattern detection grouping related signals across
workstreams. **Driver-themes are the building blocks of scenarios.** Build per §4.3.

**Proposed shared tag vocabulary** (so every analyst reads a tag the same way — the memo
proposes a starting set, to be finalized with the team):

`signal · trend · driver · disruption · risk · opportunity`

> ⚠️ **Two terminology landmines for the implementing agent:**
> 1. The app's current one-word AI classification (`trend / driver / signal / unclassified`)
>    was an **explicit placeholder** Chris told Ana he'd revisit. Treat the classification
>    layer as a **blank slate** — redesign it around the agreed vocabulary above. Do not
>    preserve the placeholder labels.
> 2. The existing `drivers` table = PPP taxonomy filter nodes, NOT driver-themes. When you
>    build driver-themes, use a distinct entity (e.g. `driver_themes`). See
>    `plans/FORESIGHT_METHODOLOGY.md` §6.1.

---

## 4. The scenario composer (the centerpiece — build this precisely)

A scenario is **a strategist's tool, role-gated to Ana.** Per Ana's Decision 2, the team
produces a **fixed set of three archetype scenarios — Baseline, Collapse, Desired** — and the
composer below is the **engine that authors each one.** The archetype is a required attribute;
the mechanic (Emphasis Blend → narrative → shift gauges → receipts) is how each archetype's
future gets shaped from driver-themes. Mock-up: `docs/mockups/image5.png` (the "Emphasis Blend"
graphic).

### 4.0 The three-scenario set (always produced, in order)

| # | Archetype | How the composer is used to author it |
|---|-----------|----------------------------------------|
| 1 | **Baseline** | Dial driver-themes to their *expected/current* trajectory — the surprise-free continuation. |
| 2 | **Collapse** | Dial the relevant driver-themes toward their *downside* — what breaks if challenges go unaddressed. |
| 3 | **Desired** | Dial toward Austin's *preferred* resolution — the aspirational future the team wants to steer to. |

(Discipline/New Equilibrium and Transformation are intentionally **out of scope** for v1 per
Ana. The schema leaves room to add them later without migration pain — see `archetype` enum.)

### 4.1 The four-step mechanic

1. **Starts from a portfolio.** Ana rolls up "ready" signals across workstreams into a
   portfolio. Every signal carries its full captured profile: CSP priority/goal mapping, budget
   read (capital/operating/grants, rough dollar band, fiscal year), momentum, strategic-anchor
   scores, sources. **The scenario is built from human-vetted intelligence, never a blank page.**
2. **Set the blend.** Ana dials each **direction/driver** up or down (e.g. lean into
   climate & resilience while holding AI/tech procurement steady). This is the **"Emphasis
   Blend"** at the top of the composer. *A scenario = a blend of trends/drivers, composed by the
   strategist.*
3. **Tool tells the story — with receipts.** For that blend the AI drafts a short narrative of
   what Austin could look like, and rolls the underlying budget + pillar reads into a row of
   gauges — **"Where Emphasis Shifts"** — dials across the **six CSP priorities**. Beneath:
   the proof — the signals/briefs/research it drew on, a rough budget read, and **which other
   cities are already doing it.**
4. **Save and compare.** Keep 2–3 scenarios side by side — e.g. "Climate-Forward Austin" vs.
   "Tech-Forward Austin." This is the **ABAG matrix** Ana shared, but *generated from her
   choices* instead of filled in by hand.

### 4.2 Why this connects to performance (the strategic payoff)

Because every signal already carries a **budget read** and a **CSP mapping**, scenarios connect
straight to the **quarterly performance conversation**: read current metrics against the chosen
emphasis and show, with sources, why a shift makes sense. **Foresight overlaid directly on
performance** — the integration the CMO reviews exist to achieve.

### 4.3 Data model for the composer

```
driver_themes               -- §3 decision (b): cross-cutting theme grouping many signals
  id, title, description, steep_or_csp_hint,
  surfaced_by               -- 'pattern_detection' | 'manual'
  embedding vector(1536)
driver_theme_signals        -- join: driver_theme_id ↔ card_id (cross-workstream)

scenarios                   -- authored via the composer; ALWAYS carries an archetype
  id, owner_id (Ana / strategist role), portfolio_id (source intelligence),
  title, narrative,         -- AI-drafted, human-editable
  archetype                 -- REQUIRED enum: baseline|collapse|desired
                            --   (enum reserves new_equilibrium|transformation for a later v2)
  scenario_set_id           -- groups the Baseline/Collapse/Desired trio for one portfolio
  status (draft|saved), created_at
scenario_emphasis           -- the "Emphasis Blend" dial settings
  scenario_id, driver_theme_id, emphasis (-2..+2 or 0..100)  -- up/down per driver
scenario_shift_gauges        -- the "Where Emphasis Shifts" output, per CSP priority
  scenario_id, pillar_code (CH/EW/HG/HH/MC/PS), shift_value, rationale
scenario_evidence            -- the "receipts"
  scenario_id, card_id | brief_id | research_id, budget_read, peer_cities[]
```

Reuse: `portfolios`/`portfolio_items` (the input), `cards`' existing budget/CSP/anchor fields
(the per-signal profile — **scenarios reassemble what's already collected, no new intelligence
needed**), `pattern_insights` + entity graph (to surface `driver_themes`).

### 4.4 API

```
POST /api/v1/portfolios/{id}/scenario-set                # scaffold the Baseline/Collapse/Desired trio at once
POST /api/v1/portfolios/{id}/scenarios                    # create a single scenario (archetype required)
PATCH /api/v1/scenarios/{id}/emphasis                     # set the blend dials for that archetype
POST /api/v1/scenarios/{id}/compose                       # AI: draft narrative + shift gauges + receipts (worker job)
GET  /api/v1/scenarios/{id}                               # narrative + archetype + emphasis + gauges + evidence
GET  /api/v1/scenario-sets/{id}                           # the trio for side-by-side compare
POST /api/v1/workstreams/driver-themes/surface            # AI pattern-detect cross-workstream themes
```
Role-gate scenario create/compose to the strategist role. Long AI steps use the existing
worker + `job_events` pattern; log to `llm_usage_events` (`estimated_cost_usd`); respect
`cost_guardrail`.

---

## 5. Briefs, portfolios, roll-up — re-template, don't rebuild

The memo is explicit: the area briefs and quarterly briefing are **the same machine at two zoom
levels.** Three moves:

1. **Re-template the brief.** Today briefs are open-ended synthesis. Give them a **fixed shape**
   leadership wants: *top drivers, momentum, budget read, watch-list.* Every area brief comes
   out in the same structure so they **stack** into the citywide one.
2. **Workstream = curation layer.** Brief is written over what the analyst marked **ready**.
   Judgment stays with the person; writing goes to the tool.
3. **Portfolio = the roll-up.** Ana reads across workstreams, pulls ready signals into a
   cross-workstream portfolio → feeds scenarios + quarterly briefing.

**Only genuinely new build: the citywide roll-up view** (level 4) where Ana reads across all
six workstreams and promotes "ready" signals. Briefs/portfolios are re-templating.

---

## 6. The quarterly briefing (the CMO deliverable)

The one-page **"Future Conditions & Emerging Risks"** view (mock-up `image7`/`image8`). It is
the citywide zoom and reuses every building block above:

- the **rigor funnel** up top (see §7),
- **all six CSP priorities** at a glance,
- the **cross-cutting drivers** that surfaced across workstreams,
- the **saved scenarios side by side**,
- a short **"where we'd lean" watch-list**,
- **every line sourced.**

Same building blocks as everything else, assembled for leadership. Extend the existing
PDF/PPTX portfolio-export path with this template.

---

## 7. "Telling the story of rigor" (a small feature with outsized value)

At every level, show the **funnel**: how many signals scanned → how many staff-reviewed → how
few made the final briefing. For leadership this **demonstrates the process is disciplined and
human-filtered**, and visibly justifies the effort. Cheap to compute from `job_events` +
workstream kanban counts + portfolio membership; high persuasive payoff in the CMO room.

---

## 8. Build sequence (driver + scenario decisions now locked)

The memo says this is a **light lift** because the tool is malleable and the scenario inputs
already sit on every card. Both gating questions are resolved (§0), so build can proceed:

1. **Redesign the classification/tag layer** around the agreed vocabulary (replace the
   placeholder `trend/driver/signal/unclassified` labels). Pre-build + assign the six CSP
   workstreams so the team starts in a populated tool.
2. **Citywide roll-up view** (level 4) — the one truly new view; promote "ready" → Ana's view.
3. **Re-template briefs** to the fixed shape (§5): top drivers, momentum, budget read, watch-list.
4. **Driver-theme surfacing** via pattern detection (§4.3) — themes informed by collections of
   signals, per Ana's Decision 1.
5. **Scenario composer** (§4) producing the **Baseline / Collapse / Desired** trio — emphasis
   blend → narrative + shift gauges + receipts → save/compare side by side.
6. **Quarterly briefing template** (§6) + **rigor funnel** (§7).

Ship 1–3 and demo to Ana early; the scenario interpretation (3-archetype set authored via the
composer) is now confirmed, so 4–6 can follow without another round-trip.

---

## 9. Where the client design and the reference methodology agree / diverge

| Topic | Reference method (`FORESIGHT_METHODOLOGY.md`) | Client design (this doc) | Decision |
|-------|----------------------------------------------|--------------------------|----------|
| Signals / scanning | Step 2, STEEP lenses | Level 1, CSP-targeted, AI-first-pass | ✅ Same; keep current pipeline |
| Domain | Step 1 | Workstream per CSP priority | ✅ Same |
| Drivers | Step 3: forces clustered from signals | "Driver-themes" grouping signals cross-workstream | ✅ **Resolved:** theme informed by a collection of signals |
| **Scenarios** | **Four fixed Dator archetypes** | **3-archetype set (Baseline/Collapse/Desired) authored via the composer** | ✅ **Resolved:** archetype frame + composer engine; 3 not 4 |
| Implications | Step 6 futures-wheel, 1st–3rd order | Folded into scenario narrative + shift gauges + peer cities | ⚠️ Client's lighter form wins for v1; futures-wheel is a later option |
| Preferred future | Step 5 | The **Desired** scenario (one of the three) | ✅ Equivalent — now an explicit archetype, not just emphasis |
| Leading indicators | Step 8, loop back to scanner | Not in client v1 (watch-list is lighter) | ⏸ Defer; revisit after v1 (high-value loop per methodology) |
| "Not a prediction" | Core principle | Printed on the graphic, "fuel gauge not forecast" | ✅ Strong agreement — enforce in copy |
| AI vs. human | AI drafts, human curates | "AI proposes, people decide" — the 1–3 hr/wk constraint | ✅ Strong agreement — design invariant |

**Net:** the client design is a **pragmatic, performance-integrated specialization** of the
methodology, tuned to Austin's CSP structure, the analysts' time budget, and the CMO cadence.
Build the client design; keep the methodology doc as the deeper "why" and as a roadmap for v2
(futures-wheel implications, the leading-indicator scanning loop).

---

## 10. Open questions — both resolved

Both questions this spec was gated on are now answered by Ana (§0):

1. ✅ **What is a driver?** → A **theme informed by a collection of signals** (not a tag).
2. ✅ **How should scenarios work?** → The **archetype development process**, reduced to a
   **3-scenario set: Baseline, Collapse, Desired**, authored via the composer.

No open blockers remain. Remaining decisions are implementation details (e.g. emphasis dial
scale, how aggressively pattern detection clusters themes) that can be tuned during build and
demoed back to Ana.

---

### Appendix — provenance
- Client memo + 9 mock-ups: `docs/Austin_Foresight_From_Signals_to_Scenarios.docx`
  (mock-ups extracted to `docs/mockups/` for reference — image5 = scenario composer,
  image7/8 = quarterly briefing).
- Reference methodology synthesis: `plans/FORESIGHT_METHODOLOGY.md`.
- Current architecture: this repo (`backend/app/`, `docs/04-data-model.md`).
