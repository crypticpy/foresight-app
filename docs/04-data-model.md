# 04 — Data Model

The shape of the world. Cards are the unit of truth; everything else is a
view, a relationship, or a process record. Schema lives in
`supabase/migrations/` (104 files; `npx supabase db push` to apply).

For the authoritative column list, query `information_schema` against the
remote DB — this doc is the conceptual map, not the column-by-column DDL.

## Core entities

### `cards`

An atomic unit of strategic intelligence — one emerging trend, technology,
or issue. Carries:

- Identity: `id`, `slug`, `title`, `summary`, `description`.
- Strategic metadata:
  - `pillar` (CH / EW / HG / HH / MC / PS — see [pillars](#strategic-pillars))
  - `stage` (Concept → Exploring → Pilot → PoC → Implementing → Scaling → Mature → Declining)
  - `horizon` (short / mid / long)
  - Multi-factor scores 0–100: `impact`, `relevance`, `velocity`, `novelty`,
    `opportunity`, `risk`
  - `signal_quality_score`
- Lens classifications (the full set — these names are right; older docs
  use `csp_codes` / `strategic_anchors` which are wrong):
  - `csp_goal_ids`, `csp_measure_ids`
  - `anchor_*` columns (People · Place · Partnerships overlay)
- Origin: `origin`, `quality_*`, links back to source URLs
- `embedding` (vector(1536), pgvector)

Cards are created via the signal agent path (`signal_agent_service.
_execute_create_signal`). Lens enrichment runs there — **not** on the older
`discovery_service._create_card` fallback.

### `sources`, `discovered_sources`, `signal_sources`

- `sources` — canonical source records (with `embedding`, quality fields).
- `discovered_sources` — URLs the discovery pipeline pulled in, persisted
  **before** triage so we don't lose paid-for URLs on an LLM failure.
- `signal_sources` — many-to-many between cards and sources.

### `workstreams`, `workstream_cards`, `workstream_*`

A workstream is a user- or org-curated research stream.

- `owner_type` is `user` or `org`. Org-owned workstreams are read-only and
  visible to all users; user-owned ones are private to the owner unless
  shared.
- `workstream_cards` — membership join with the kanban status:
  - `inbox`, `working`, `ready`, `archived`
  - `is_watching` is an orthogonal flag
- `workstream_scans` — long-running scan jobs (status in `job_events`)
- `workstream_members` / `workstream_invites` / `workstream_presence` /
  `workstream_activity` — collaboration substrate
- `user_workstream_clones` — fan-out of org workstreams into per-user copies
- `user_workstream_card_dismissals` / `user_card_dismissals` — per-user
  hides for the discovery feed

Read-side authz pattern (also in [05-api-conventions.md](./05-api-conventions.md)):

```python
if ws.get("owner_type") != "org" and ws.get("user_id") != user_id:
    raise HTTPException(404)
```

404, not 403 — don't leak existence.

### `portfolios`, `portfolio_items`

Curated card collections (≤ 15 cards). `workstream_id` is nullable —
portfolios can be scoped to a single workstream or cross-workstream. Drives
PDF/PPTX export (`portfolio_export.py`).

### `executive_briefs` (+ versioning), `cached_insights`

- Briefs generated via `brief_service` against a card or portfolio.
- Versioned (`brief_versioning` migration); the worker handles long
  generations as `JOB_BRIEF`.
- `cached_insights` stores pre-computed analytics for the dashboard.

### Chat

- `chat_conversations` + `chat_messages` (citations stored as JSONB)
- `chat_pinned_messages`
- Frontend caches in sessionStorage; Supabase is the source of truth.

### Observability + ops

- `job_events` — structured `started` / `progress` / `completed` / `failed`
  records keyed by `(kind, id)`. UI and worker health probe both read this.
  Status writes are guarded so a late heartbeat can't revert a failed job
  to running (PR #61).
- `llm_usage_events` — every LLM call. **Cost column is
  `estimated_cost_usd`**. Writing `cost_usd` silently returns `$0`.
- `external_api_usage_events` — Serper / SearXNG / etc.
- `admin_audit_log` — admin actions
- `cost_guardrail_state` — daily spend caps (`app/cost_guardrail.py`)
- `safety_incidents` — moderation log

### Pattern / entity / reputation

- `entities`, `entity_aliases`, `entity_mentions`, `entity_relationships` —
  cross-card entity graph
- `pattern_insights` — output of `pattern_detection_service` (nightly)
- `domain_reputation`, `source_ratings`, `source_preferences` — SQI inputs

### Discovery + RSS

- `discovery_runs`, `discovery_schedule`, `discovery_blocks`,
  `discovery_sources_registry`, `discovery_quality_stats`
- `rss_feeds`, `rss_feed_items`
- `saved_searches`, `search_history`

### Reference data (taxonomy)

- `pillars`, `stages`, `horizons`, `goals`, `csp_goals`, `csp_measures`,
  `anchors`, `drivers`, `strategic_anchors`, `strategic_frameworks`,
  `framework_categories`, `top25_priorities`, `priorities`,
  `implications`, `implications_analyses`

These are seeded by `1766434584_populate_reference_data.sql` and friends.

## Strategic pillars

Codes live in the DB and in `backend/app/taxonomy.py` (`PILLAR_NAMES`):

| Code | Name                               |
| ---- | ---------------------------------- |
| CH   | Community Health & Sustainability  |
| EW   | Economic & Workforce Development   |
| HG   | High-Performing Government         |
| HH   | Homelessness & Housing             |
| MC   | Mobility & Critical Infrastructure |
| PS   | Public Safety                      |

All 6 canonical codes pass through `convert_pillar_id()` natively. Don't
re-introduce the lossy AI→DB mapping table that older docs reference.

## Maturity stages

`Concept → Exploring → Pilot → PoC → Implementing → Scaling → Mature →
Declining`. The numeric → ID mapping is in `taxonomy.STAGE_NUMBER_TO_ID`.

## Kanban statuses

Per `workstream_cards` row, distinct from card maturity: `inbox`, `working`,
`ready`, `archived`. `is_watching` is independent.

## RLS posture

RLS is enabled on every table. The server uses the **service-role client**
(`supabase` from `app/deps.py`) so RLS does not enforce per-user access in
the backend — authz is implemented explicitly in routers (see the org-vs-
user pattern above). Direct browser access to Supabase is rare; when it
happens it uses the anon key and is subject to RLS.

For the auth model, rate limits, and middleware, see
[SECURITY.md](./SECURITY.md).

## Vectors + search

- pgvector 1536-dim embeddings on `cards`, `sources`, chat tables.
- pgvector lives in the `extensions` schema — SQL functions using its
  operators need `SET search_path = extensions, public` at the top.
- Hybrid search functions: `hybrid_search_cards()`, `hybrid_search_sources()`
  (RRF over tsvector FTS + vector similarity).
- Card dedup cosine threshold: **0.92** (`deduplication.py`).

## JSONB and dates

- Pass Python dicts/lists directly into Supabase JSONB columns. **Don't**
  `json.dumps()` first — supabase-py will double-encode.
- Always `datetime.now(timezone.utc)`. Never strip tzinfo from DB
  timestamps when comparing.

## Things easy to break

- `websearch_to_tsquery` chokes on `() : < > ! | &`. Run user input through
  `_sanitize_fts_query(q)` first.
- Supabase `.ilike()` does **not** escape `%` / `_`. Sanitize before
  searching by user input.
- Sync Supabase client blocks the event loop. From async paths, wrap with
  `asyncio.to_thread(...)`.
- `len(source_map)` is wrong for citation indexing — keys are sparse. Use
  `max(source_map.keys(), default=0) + 1`.
