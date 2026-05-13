# Pattern Detection v2 — Multi-PR Plan

## Context

The existing `backend/app/pattern_detection_service.py` (596 lines) is a pairwise-cosine cross-pillar detector on **card embeddings only**. It groups cards from different pillars by raw vector similarity (0.70 < cos < 0.95), runs a union-find, and asks `gpt-5.4` to synthesize an insight per cluster. Three structural problems:

1. **Operates downstream of card creation.** Anything that hasn't yet become a card is invisible. Cross-pillar trends rising in the raw `discovered_sources` stream cannot surface as patterns until the discovery pipeline materializes them as cards — too late to be "early signal."
2. **Embedding similarity ≠ entity co-occurrence.** Two cards about _housing affordability_ and _transit funding_ may sit near each other in vector space without any shared concrete actor, technology, or policy lever. The model conflates topical adjacency with structural connection.
3. **Outdated pillar list and no math hygiene.** The hardcoded `STRATEGIC_PILLARS = ["CH", "MC", "HS", "EC", "ES", "CE"]` doesn't match the production set `CH / EW / HG / HH / MC / PS`. No corpus-size normalization, no story-cluster dedup, no SQI weighting, no rejection-feedback loop.

Pattern Detection v2 reframes the detector around three deliberate inversions:

- **Sources are the primary substrate.** Cards become a _confirmation layer_ — "we already wrote about this" — not the only substrate.
- **Entities, not embeddings.** An LLM extracts canonical entities (people, programs, technologies, places, policy levers) per source/card. Patterns are detected on entity counts and co-occurrences, not vector cosine.
- **Candidate generation is deterministic; LLM is only the judge.** Three SQL-driven candidate modes (breadth, volume lift, co-occurrence) feed a `gpt-5.4` judge that _accepts or rejects_ with structured rationale. Both decisions persist. Operator dismissals + judge rejects suppress the same entity for 14 days.

This plan ships as **5 small PRs**, each independently shippable and babysat by the `pr-babysitter` agent (CLAUDE.md PR workflow). The existing public API (`/api/v1/pattern-insights*`) stays stable throughout so the frontend keeps working while v2 ramps up behind a feature flag (PR-3 → PR-5).

The architecture (extraction → reconciliation → mention materialization → deterministic candidates → judge → rejects/coverage gaps) is settled — this plan executes it, not re-debates it.

## Constraints and conventions

- **Model routing.** Only `gpt-5.4` and `gpt-5.4-mini` via `openai_provider.py` tier helpers (`get_chat_mini_deployment`, `get_chat_agent_deployment`). Embeddings stay on `text-embedding-ada-002` (pgvector compatibility, 1536-dim). Never hardcode model strings.
- **Cost telemetry.** Column is `estimated_cost_usd` — not `cost_usd`. All LLM calls already record usage via the `_InstrumentedClientProxy` in `openai_provider.py`; we don't write usage rows by hand.
- **Cost guardrail.** Every backfill loop and the nightly scheduled detector must `await check_budget_or_skip()` (pattern from `backend/app/signal_agent_service.py:583`) and abort cleanly on `BudgetExceededError`. Backfill scripts must be **pause/resume capable** — they checkpoint by primary key and the next invocation continues where the prior one left off.
- **Supabase async.** Sync client blocks the event loop; wrap calls in `asyncio.to_thread(...)`. JSONB columns accept Python `dict`/`list` directly — never `json.dumps()` first. RLS is on for everything; service-role client is what runs server-side.
- **Versioned prompts.** Mirror `csp_goal_query_service.py`: a module-level `PROMPT_VERSION` constant + a `_cache_version()` helper. Rows carry `concept_tags_version` text. Bumping the version triggers parallel-version backfill (idempotent), not a stop-the-world re-tag. Reconciliation likewise scopes by version.
- **Pillar set.** Production codes are `CH / EW / HG / HH / MC / PS` (CLAUDE.md). The retired `STRATEGIC_PILLARS = ["CH", "MC", "HS", "EC", "ES", "CE"]` constant goes away with the v1 service in PR-5.
- **API stability.** Existing endpoints under `/api/v1/pattern-insights*` keep their request/response shapes. PR-4 adds `/api/v1/coverage-gaps`; PR-3 may add a `detector_version` column to `pattern_insights` for A/B differentiation but must not remove existing columns.
- **PR style.** Small, focused, conventional-commit prefix, branch `<type>/<slug>`. After `gh pr create`, run `/babysit-pr <N>` — the agent auto-squash-merges after CI green + two consecutive quiet ticks. Pass `--no-merge` only when manual final-look is needed.
- **Code hygiene.** Touched-file rule: `ruff check` and `eslint` issues in any file we edit are fixed in the same PR. No `# noqa` / `// @ts-ignore` escape hatches.
- **Math correctness (non-negotiable, from review pass).** Each item must be implemented as described below; PR sections re-state them so reviewers and bots can verify.

## Math correctness requirements (re-stated)

| #   | Rule                                                                                                                                                                                                                     | Where it lives                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| M1  | **Share-of-mentions normalization.** Mode B compares `entity_mentions_in_window / total_pillar_mentions_in_window` across windows, NOT raw counts. Avoids declaring everything "rising" during corpus growth.            | PR-3 candidate generator              |
| M2  | **Novelty bucket is separate.** `baseline = 0 AND recent >= floor` surfaces as its own category (`novelty`), not as a lift outlier sorted via `NULLS LAST`.                                                              | PR-3 candidate generator              |
| M3  | **Story-cluster dedup.** Mode A counts `COUNT(DISTINCT story_cluster_id) FILTER (WHERE pillar_id = X) >= 3`, not raw source count. Press-release syndication doesn't inflate breadth.                                    | PR-4 candidate generator              |
| M4  | **SQI weighting.** Each mention contributes `1 * sqi` to weighted score (NULL SQI → 0.5 floor, never NULL into SUM). Pre-judge ranking uses the weighted score, not raw count.                                           | PR-3 pre-judge weighting              |
| M5  | **Diversified judge evidence.** Top-K by salience is biased sampling. Diversify across (pillar, source domain, time-bucket) before passing snippets to the judge.                                                        | PR-3 judge service                    |
| M6  | **LLM confidence is persisted, never thresholded.** Accept/reject is a hard binary on `decision`. `confidence` lives in the row for triage UX only — never `if confidence > 0.x` in code.                                | PR-3 judge service                    |
| M7  | **Mode C bounded.** Co-occurrence triangles operate on the entity set from `Mode A ∪ Mode B` (≤ ~50 entities), not the full `entity_mentions` table. O(N²) blow-up is structurally impossible.                           | PR-4 candidate generator              |
| M8  | **14-day suppression.** An entity that produced a judge-reject or operator-dismissal within the last 14 days is filtered out at candidate generation. Same prompt_version only — bumping the version clears suppression. | PR-3 candidate generator + PR-4 reuse |

## Critical files reused (not duplicated)

| Path                                                         | Why                                                                                                                                                                                                       |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/app/openai_provider.py`                             | `get_chat_mini_deployment` (extraction), `get_chat_agent_deployment` (judge), `get_embedding_deployment` (canonical reconciliation). Single source for model routing; never hardcode.                     |
| `backend/app/csp_goal_query_service.py`                      | Reference template for versioned-prompt + cache-on-row + best-effort persistence + `_parse_query_list` JSON-fence-stripping pattern. PR-1 extraction service mirrors this shape.                          |
| `backend/app/story_clustering_service.py`                    | `story_cluster_id` semantics — sources at cosine ≥ 0.90 share a cluster ID. Used by Mode A's distinct-cluster dedup (M3) and Mode B's per-cluster mention deduping.                                       |
| `backend/app/cost_guardrail.py`                              | `check_budget_or_skip()` + `BudgetExceededError` — gates every LLM-calling loop (backfill scripts, scheduled detector run).                                                                               |
| `backend/app/scheduler.py:275-293`                           | Where `run_nightly_pattern_detection` is wired today. PR-3 replaces the body behind a flag; PR-5 deletes the old import path.                                                                             |
| `backend/app/routers/pattern_insights.py`                    | Existing API surface — must remain backward-compatible. PR-4 extends with `/coverage-gaps`. PR-3 keeps the v1 trigger endpoint working until PR-5.                                                        |
| `backend/app/discovery_service.py:3510-3525`                 | The `cluster_sources` hand-off site for new sources. PR-2 adds an `await extract_concept_tags(source_ids)` call immediately after clustering completes (story_cluster_id available, sqi soon thereafter). |
| `backend/app/lens_classification_service.py:63`              | `CLASSIFIER_VERSION` pattern + `asyncio.to_thread` batched-write idiom. Reuse the surrounding structure for `EXTRACTION_PROMPT_VERSION`.                                                                  |
| `backend/app/signal_agent_service.py:583`                    | Canonical `await check_budget_or_skip()` call site. Copy verbatim for backfill scripts.                                                                                                                   |
| `supabase/migrations/1766435002_discovered_sources.sql`      | `discovered_sources` schema — `content_snippet`, `content_embedding VECTOR(1536)`, `triage_primary_pillar`, `analysis_pillars`, `created_at`. PR-2 adds `concept_tags`/`concept_tags_version`.            |
| `supabase/migrations/1766739004_sources_quality_fields.sql`  | `sources.story_cluster_id` + sparse indexes — the dedup column Mode A relies on (M3).                                                                                                                     |
| `supabase/migrations/1766434534_create_users_and_cards.sql`  | `cards` schema — extended by PR-1 with `concept_tags JSONB DEFAULT '[]'` + `concept_tags_version TEXT`.                                                                                                   |
| `supabase/migrations/1766739400_create_pattern_insights.sql` | Existing `pattern_insights` row shape. PR-3 may add `detector_version` for A/B; never rename existing columns.                                                                                            |
| `backend/scripts/backfill_lens_classification.py`            | Template for idempotent batch backfill with progress logs + cost guardrail. PR-1/PR-2 backfill scripts mirror it.                                                                                         |
| `backend/tests/test_cost_guardrail.py`                       | Mock pattern for cost-guardrail integration tests.                                                                                                                                                        |

---

## PR-1 — Foundation: schema + extraction + reconciliation + CARD backfill

**Branch:** `feat/entity-extraction-foundation`

### Goal

Stand up the entity layer end-to-end on **cards only** so we can validate the extraction prompt and reconciliation logic against a bounded corpus before touching the much larger `discovered_sources` table. No behavior change to user-facing surfaces — the existing v1 `pattern_detection_service.py` keeps running on the nightly schedule unchanged.

### Math correctness items applicable

None yet — this PR establishes the substrate. M1-M8 enter in PR-3/PR-4.

### Schema changes (one migration: `<ts>_pattern_v2_foundation.sql`)

- `cards`
  - `ADD COLUMN IF NOT EXISTS concept_tags JSONB NOT NULL DEFAULT '[]'::jsonb`
  - `ADD COLUMN IF NOT EXISTS concept_tags_version TEXT` (nullable)
  - Partial index `WHERE concept_tags_version IS NOT NULL` for "find rows due for re-tag" queries
- `entities` (new)
  - `id UUID PK DEFAULT gen_random_uuid()`
  - `canonical_name TEXT NOT NULL`
  - `entity_type TEXT NOT NULL` (one of: `person`, `org`, `program`, `tech`, `place`, `policy`, `event`, `other`)
  - `canonical_embedding VECTOR(1536)` (ada-002)
  - `prompt_version TEXT NOT NULL` (the extraction prompt version that birthed this canonical row)
  - `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`
  - Unique on `(canonical_name, entity_type, prompt_version)` to make merge-or-create idempotent
  - ivfflat index on `canonical_embedding vector_cosine_ops` (lists=100) for reconciliation lookups
- `entity_aliases` (new)
  - `id UUID PK`
  - `entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE`
  - `alias TEXT NOT NULL`
  - `prompt_version TEXT NOT NULL`
  - Unique on `(entity_id, lower(alias))`
  - Index on `lower(alias)` for the alias-overlap check in reconciliation
- `entity_mentions` (new — flat, denormalized for the deterministic candidate SQL)
  - `id UUID PK`
  - `entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE`
  - `item_id UUID NOT NULL` (no FK — heterogeneous; `item_type` discriminates)
  - `item_type TEXT NOT NULL CHECK (item_type IN ('card','source'))`
  - `pillar_id TEXT` (nullable for sources without a triage pillar)
  - `story_cluster_id UUID` (NULL for cards; populated for sources — added properly in PR-2)
  - `sqi REAL` (NULL until SQI exists for the item; defaults assumed 0.5 in M4)
  - `stance TEXT` (one of: `support`, `oppose`, `neutral`, `unknown`)
  - `salience REAL` (0.0-1.0, extracted)
  - `item_created_at TIMESTAMPTZ NOT NULL` (denormalized for window queries — avoids joining cards/sources on every detector run)
  - `prompt_version TEXT NOT NULL`
  - `created_at TIMESTAMPTZ DEFAULT NOW()`
  - Unique on `(entity_id, item_id, item_type, prompt_version)` (idempotent backfill)
  - Indexes:
    - `(prompt_version, item_type, item_created_at DESC)` — primary window scan
    - `(prompt_version, pillar_id, item_created_at DESC)` — per-pillar share computations (M1)
    - `(prompt_version, entity_id, item_created_at DESC)` — entity-history lookup for suppression / judge evidence
  - RLS: enable; service-role full access; authenticated read (mirrors `pattern_insights` policy)

All five tables get the standard `updated_at` trigger pattern used in `pattern_insights` (`SECURITY DEFINER`, `SET search_path = public`). The migration is idempotent (`IF NOT EXISTS` throughout) so partial re-applies during dev are safe.

### Files changed

| Path                                                  | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/<ts>_pattern_v2_foundation.sql`  | NEW. All schema above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `backend/app/entity_extraction_service.py`            | NEW. `EXTRACTION_PROMPT_VERSION = "v1"`. Public API: `async def extract_concept_tags(items: list[ConceptTagInput]) -> list[ConceptTagOutput]`. Uses `get_chat_mini_deployment()`. Mirrors `csp_goal_query_service.py` structure: system prompt + user prompt + `_parse_concept_tags` (fence-stripping, JSON list-of-objects validation, salience clamp `[0,1]`, stance enum, max N tags). Each item runs as one chat completion (cheap on mini); telemetry rides on the proxy. JSON schema per tag: `{canonical, aliases, type, salience, stance}`. Persistence: caller passes results to `_write_concept_tags(card_id, tags, version)` which writes the JSONB column and materializes `entity_mentions` rows (without `entity_id` yet — reconciliation fills that). Two-phase write keeps extraction idempotent on retry.                                                                                                                                                    |
| `backend/app/entity_reconciliation_service.py`        | NEW. Public API: `async def reconcile_pending(prompt_version: str, *, batch_size: int = 200) -> ReconcileSummary`. Finds `entity_mentions` rows with NULL `entity_id` for the given prompt_version. For each `(canonical, type)` tuple: embed via `openai_async_client.embeddings.create(model=get_embedding_deployment(), ...)`, then query `entities` via pgvector RPC `match_entities(query_embedding, prompt_version, threshold=0.85, limit=5)`. A match also requires **alias-string overlap** (case-folded substring match in either direction OR exact alias hit) — pure cosine is too permissive. On match: insert into `entity_aliases` if alias is new, update `entity_mentions.entity_id`. On miss: insert new `entities` row + initial alias, then update `entity_mentions`. All Supabase ops wrapped in `asyncio.to_thread`. Includes a `match_entities` Postgres function shipped in the same migration above (or a follow-up migration in this PR — colocate). |
| `backend/scripts/backfill_entity_tags_cards.py`       | NEW. Iterates `cards` where `concept_tags_version IS NULL OR concept_tags_version != EXTRACTION_PROMPT_VERSION`. Batch size 25 cards. Between batches: `await check_budget_or_skip()` (`BudgetExceededError` → log + exit 0 so it's retryable on cron). Checkpoint by `cards.id` ordered by `created_at ASC` to make pause/resume trivial. Calls `extract_concept_tags` → `reconcile_pending`. CLI flags: `--dry-run`, `--limit`, `--prompt-version` (defaults to module constant). Mirrors `backfill_lens_classification.py` shape.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `backend/tests/test_entity_extraction_service.py`     | NEW. Cases: malformed JSON, JSON with fence markers, oversized tag list (clamped), empty array (returns `[]` and writes empty JSONB without error), salience out-of-range clamping, stance enum normalization. Mocks `openai_async_client` like `test_cost_guardrail.py`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `backend/tests/test_entity_reconciliation_service.py` | NEW. Cases: new entity (no existing match → insert), merge to existing entity (cosine ≥ 0.85 + alias overlap), cosine high but **no** alias overlap → no merge (covers the "ada-002 is too generous on near-synonyms" failure mode), alias accumulation (second mention adds new alias to existing entity), prompt-version scoping (same canonical name under v1 and v2 are separate rows).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `backend/tests/test_backfill_entity_tags_cards.py`    | NEW. Cases: idempotent re-run is no-op, budget-trip mid-batch exits cleanly with checkpoint persisted (next run resumes), `--dry-run` writes nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

### Verification

```bash
cd backend && pytest tests/test_entity_extraction_service.py tests/test_entity_reconciliation_service.py tests/test_backfill_entity_tags_cards.py -v
cd backend && ruff check app/entity_extraction_service.py app/entity_reconciliation_service.py scripts/backfill_entity_tags_cards.py
npx supabase db push --linked       # apply migration to local linked project
python -m backend.scripts.backfill_entity_tags_cards --limit 20 --dry-run
python -m backend.scripts.backfill_entity_tags_cards --limit 20   # real run, small batch
# Manual: inspect 5 entity_mentions rows + their entity_id rows; confirm aliases populated and embedding present
# Manual: query usage_telemetry for the latest 20 minutes; confirm estimated_cost_usd is non-NULL on each call
```

### Babysit loop

```bash
gh pr create --title "feat: pattern v2 — entity extraction foundation (cards + schema)" --body <body>
/babysit-pr <N>
```

`pr-babysitter` polls CodeRabbit / Codex / Greptile / Sourcery, addresses each comment (push fix or reply with reasoning), re-runs the verification block on every push, exits clean after two consecutive quiet ticks with green CI, then auto-squash-merges with `--delete-branch`. No `--no-merge` flag — this PR is purely additive and merging early reduces drift with PR-2.

### Residual risk surfaced

- The extraction prompt is the load-bearing piece. We should hand-eyeball ~30 card outputs after the local backfill to confirm aliases are not garbage and `entity_type` distribution is sane before scaling to sources.
- Reconciliation threshold 0.85 + alias overlap is a guess. If the first sources backfill (PR-2) shows over-merging, the fix is bumping the threshold to 0.88 — keep the constant top-of-module and named.

---

## PR-2 — Extend extraction to sources + populate story_cluster/SQI in mentions

**Branch:** `feat/entity-extraction-sources`

### Goal

Tag the much larger `discovered_sources` corpus, wire extraction into the live discovery pipeline so new sources tag in real time, and ensure `entity_mentions` rows for sources carry the `story_cluster_id` + `sqi` columns that Mode A/B math (M3, M4) depend on.

### Math correctness items applicable

- **M3 (story-cluster dedup)** — `entity_mentions.story_cluster_id` must be populated from `sources.story_cluster_id` at the moment the mention row is created, AND backfilled retroactively for existing source-derived mentions. Without this column populated, Mode A in PR-4 falls back to raw counting and over-surfaces syndicated stories.
- **M4 (SQI weighting)** — `entity_mentions.sqi` must be populated from the source's SQI score at mention-write time (`quality_service` already produces these per card; per-source SQI is derived from `analysis_*` fields on `discovered_sources`). Backfill nullable for cards where SQI doesn't exist; downstream code defaults NULL → 0.5.

### Schema changes (one migration: `<ts>_pattern_v2_sources.sql`)

- `discovered_sources`
  - `ADD COLUMN IF NOT EXISTS concept_tags JSONB NOT NULL DEFAULT '[]'::jsonb`
  - `ADD COLUMN IF NOT EXISTS concept_tags_version TEXT`
  - Partial index on `concept_tags_version` for "find rows due for re-tag"
- `entity_mentions`: columns `story_cluster_id` and `sqi` already exist from PR-1; this migration only ensures their indexes are in place. **If PR-1 was merged without those indexes**, add:
  - `(prompt_version, item_type, story_cluster_id)` partial WHERE `story_cluster_id IS NOT NULL` — supports M3 distinct-cluster aggregation
- Idempotent — `IF NOT EXISTS` throughout.

### Files changed

| Path                                                 | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `supabase/migrations/<ts>_pattern_v2_sources.sql`    | NEW. Schema above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `backend/app/entity_extraction_service.py`           | EXTEND. Add a second public entry point `async def extract_concept_tags_for_sources(source_rows: list[dict]) -> list[ConceptTagOutput]`. Sources use `title` + `content_snippet` (`discovered_sources` does **not** have a `description` field — confirmed against the schema; using `full_content` would 10× token cost without proportional signal-quality gain). Pass `triage_primary_pillar` + `triaged_at` through so `_write_concept_tags` can stamp `pillar_id` and `item_created_at` on the resulting `entity_mentions` rows correctly. SQI is read from `discovered_sources.analysis_*` derived score (compute the same way `quality_service` does — extract a `_source_sqi(row)` helper if needed and unit-test it). |
| `backend/scripts/backfill_entity_tags_sources.py`    | NEW. Mirrors the cards backfill but iterates `discovered_sources` ordered by `created_at ASC`, batch size **10** (sources are bigger payloads + 10×-ish cardinality vs cards). Cost guardrail between every batch. **Pause/resume:** write the last processed `id`+`created_at` to a lightweight `pattern_v2_backfill_state` row (insert if missing on first run) and resume from there. CLI: `--dry-run`, `--limit`, `--prompt-version`, `--since <iso-date>` (restart-from-cursor override), `--rate-limit-sleep <sec>` (default 0.2s between calls to be polite to the OpenAI tier).                                                                                                                                        |
| `backend/app/discovery_service.py`                   | EXTEND. In `_finalize_sources_and_cluster` (around line 3510-3525, right after `cluster_sources` returns the cluster IDs), add `await _extract_and_persist_tags_for_new_sources(self.supabase, openai_async_client, all_stored_source_ids)`. Implemented as a thin coroutine in this file that batches the new source IDs, calls `entity_extraction_service.extract_concept_tags_for_sources`, and writes `entity_mentions` rows with `story_cluster_id` populated (the cluster IDs are now available from the prior step). Wrapped in `try/except` with non-fatal logging — extraction failure must not break the discovery run.                                                                                              |
| `backend/tests/test_entity_extraction_sources.py`    | NEW. Cases: truncated content (`content_snippet` < 100 chars → still returns valid `[]` not an error), missing `title` (defaults to URL slug), non-English content (extractor must return `[]` rather than hallucinate English entities — assert behavior), `triage_primary_pillar` propagates to `entity_mentions.pillar_id`, sqi derivation.                                                                                                                                                                                                                                                                                                                                                                                 |
| `backend/tests/test_discovery_extraction_hook.py`    | NEW. Mocks `cluster_sources` to return known cluster IDs, then asserts `entity_mentions` rows for the source IDs carry the expected `story_cluster_id` and `pillar_id` (the M3 plumbing test).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `backend/tests/test_backfill_entity_tags_sources.py` | NEW. Adds pause/resume cases on top of the cards-backfill test pattern: kill mid-batch, restart, confirm no double-processing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### Verification

```bash
cd backend && pytest tests/test_entity_extraction_sources.py tests/test_discovery_extraction_hook.py tests/test_backfill_entity_tags_sources.py -v
cd backend && ruff check app/entity_extraction_service.py app/discovery_service.py scripts/backfill_entity_tags_sources.py
npx supabase db push --linked

# Backfill — keep an eye on cost
python -m backend.scripts.backfill_entity_tags_sources --limit 200 --rate-limit-sleep 0.2
# Confirm entity_mentions rows for those sources have story_cluster_id + sqi populated:
#   select count(*), count(story_cluster_id) from entity_mentions where item_type='source';

# Live hook smoke: trigger a small discovery run from the admin console, wait ~60s, then:
#   select id, concept_tags_version, jsonb_array_length(concept_tags) from discovered_sources
#   where created_at > now() - interval '5 minutes';
# Every row should have concept_tags_version set and the JSONB non-empty for non-trivial titles.
```

### Babysit loop

Standard `/babysit-pr <N>`. Auto-merges after CI green + 2 quiet ticks.

### Residual risks

- **Cold-start cost spike.** First backfill on the production-size `discovered_sources` table will be the largest single LLM bill we've placed via this codebase. The `check_budget_or_skip` gate is required, but consider also setting `--limit 1000` on the first invocation and inspecting `usage_telemetry` sum before continuing.
- **Multi-layer LLM compounding.** Triage → analysis → extraction now stack three LLM passes per source. Per-source cost roughly doubles. PR-3's pre-judge floor exists in part to keep the judge stage's cost flat regardless of corpus growth.

---

## PR-3 — Mode B detector + judge stage + feature flag

**Branch:** `feat/pattern-v2-volume-lift`

### Goal

Stand up the v2 detection pipeline end-to-end for **volume-lift only** (the single most reviewer-debuggable of the three modes), gated behind a feature flag, writing accepts to `pattern_insights` and rejects to a new `pattern_insight_rejections` table. v1 keeps running by default. Operators can enable v2 in shadow on local, validate ~20 candidate-rationale pairs by hand, then promote.

### Math correctness items applicable

- **M1 share-of-mentions normalization** in `candidate_generator.py`.
- **M2 novelty bucket** as a separate output category.
- **M4 SQI weighting** in `pre_judge_weighting.py`.
- **M5 diversified judge evidence** in `judge_service.py`.
- **M6 LLM confidence persisted not thresholded.**
- **M8 14-day suppression** queried from `pattern_insight_rejections` + dismissed `pattern_insights`.

### Schema changes (one migration: `<ts>_pattern_v2_rejections.sql`)

- `pattern_insight_rejections` (new)
  - `id UUID PK`
  - `entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE`
  - `mode TEXT NOT NULL CHECK (mode IN ('breadth','volume_lift','novelty','cooccurrence'))`
  - `window_days INTEGER NOT NULL CHECK (window_days IN (7,30,90))`
  - `candidate_snapshot JSONB NOT NULL` (the full pre-judge structure: counts, share, lift, sqi-weighted score, story dedup, sample evidence)
  - `rejection_reason TEXT NOT NULL` (judge's structured reason)
  - `judge_confidence REAL` (persisted, never thresholded — M6)
  - `prompt_version TEXT NOT NULL`
  - `judged_at TIMESTAMPTZ DEFAULT NOW()`
  - Indexes: `(entity_id, judged_at DESC)` for suppression lookup (M8), `(judged_at DESC)` for admin browsing.
  - RLS: service-role full access; authenticated read.
- `pattern_insights`
  - `ADD COLUMN IF NOT EXISTS detector_version TEXT` (nullable; v1 inserts leave it NULL, v2 inserts stamp `"v2"`). Enables A/B partition + clean retire in PR-5 without renaming any existing column.
  - `ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES entities(id)` (nullable for v1 backward compat; v2 always populates).
  - `ADD COLUMN IF NOT EXISTS mode TEXT` (nullable; one of the same enum as above; for v2 rows).
  - `ADD COLUMN IF NOT EXISTS window_days INTEGER` (nullable; for v2 rows).

### Feature flag

`FORESIGHT_PATTERN_V2_ENABLED` (default `false`). Read in `scheduler.py` and the on-demand router endpoint. When false → v1 runs unchanged. When true → v2 runs. **They never both run.** Parallel-write A/B is tempting but doubles cost and creates an "active insights" UX mess; instead, the rejections table + the `detector_version` column on accepts give us the post-hoc comparability we actually need.

### Files changed

| Path                                                      | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/<ts>_pattern_v2_rejections.sql`      | NEW. Schema above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `backend/app/pattern_detection_v2/__init__.py`            | NEW. Package marker. Exports `run_detection_v2()` as the single entry point.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `backend/app/pattern_detection_v2/candidate_generator.py` | NEW. Module-level `EXTRACTION_PROMPT_VERSION` (re-imported from `entity_extraction_service`). Public: `async def generate_mode_b_candidates(window_days: int) -> list[ModeBCandidate]` for each of `{7, 30, 90}`. SQL approach: a single CTE that (a) computes `total_pillar_mentions_in_window` per pillar (denominator for M1), (b) computes `entity_mentions_per_pillar_in_window` per `(entity_id, pillar_id)`, (c) computes share = b/a, (d) does the same for the prior baseline window of equal width offset by `window_days`, (e) computes lift = recent_share / NULLIF(prior_share, 0), (f) buckets: `volume_lift` where `lift >= 2.0 AND recent_count >= floor`; `novelty` where `prior_count = 0 AND recent_count >= floor` (M2 — separate bucket, not lift NULLs sorted last), (g) suppresses entities with a rejection or dismissal in the last 14 days (M8 — JOIN against `pattern_insight_rejections` and `pattern_insights WHERE status='dismissed'`). Uses parameterized SQL via Supabase RPC function `mode_b_candidates(window_days, prompt_version)` (defined in the same migration for query-plan stability — Supabase PostgREST struggles with multi-CTE inline queries). `floor` is a module constant — start at 5 mentions; we'll tune. Returns dataclass list. |
| `backend/app/pattern_detection_v2/pre_judge_weighting.py` | NEW. Public: `def weight_candidates(candidates: list[ModeBCandidate]) -> list[WeightedCandidate]`. For each candidate, compute: `distinct_story_count = COUNT DISTINCT story_cluster_id over the entity's source mentions in window` (already in the candidate row from the SQL), `sqi_weighted_score = SUM(COALESCE(sqi, 0.5))` over the same mentions (M4 — NULL SQI defaults 0.5, never produces NULL aggregate), `card_confirmation = EXISTS(mention with item_type='card')`, `source_only = NOT card_confirmation`, `stance_distribution = {support: n, oppose: n, neutral: n, unknown: n}`. Hard floor drops candidates where `distinct_story_count < 3 AND NOT card_confirmation` — these are press-release artifacts surfacing on syndication. Returns sorted by `sqi_weighted_score DESC`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `backend/app/pattern_detection_v2/judge_service.py`       | NEW. `JUDGE_PROMPT_VERSION = "judge-v1"`. Public: `async def judge_candidates(candidates: list[WeightedCandidate]) -> JudgeResults`. For each: build the prompt with a **diversified evidence sample** (M5) — group the entity's mentions by `(pillar_id, source_domain, week_bucket)` and pick one mention per group via cross-group round-robin until 8-12 mentions chosen, NOT top-K by salience. Include 2-3 recent rejections for the same entity from `pattern_insight_rejections` so the judge sees what's already been argued. Call `get_chat_agent_deployment()` with `response_format={"type": "json_object"}`. Expected JSON: `{decision, story, action, urgency, confidence, rejection_reason}`. `decision ∈ {accept, reject}` — hard binary, no thresholding on `confidence` (M6). On `accept`: insert into `pattern_insights` with `detector_version='v2'`, `entity_id`, `mode='volume_lift'` or `'novelty'`, `window_days`. On `reject`: insert into `pattern_insight_rejections` with the full candidate snapshot + the reason + the persisted confidence. JSON parse errors → record as `reject` with `rejection_reason='judge_parse_failure'` (counts toward suppression — better than retrying indefinitely).                                                        |
| `backend/app/pattern_detection_v2/runner.py`              | NEW. Thin orchestrator: `async def run_detection_v2() -> dict`. Calls each of `generate_mode_b_candidates` for `{7, 30, 90}`, `weight_candidates`, `judge_candidates`, returns summary like the v1 service. `await check_budget_or_skip()` before the judge loop (it's where the $ lives). Logs cost summary on completion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `backend/app/scheduler.py`                                | EDIT. In `run_nightly_pattern_detection`, branch on `FORESIGHT_PATTERN_V2_ENABLED`. When true → `from app.pattern_detection_v2.runner import run_detection_v2; await run_detection_v2()`. When false → existing v1 path. Single env-var read at function entry (not module top — must respect runtime flips).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `backend/app/routers/pattern_insights.py`                 | EDIT. `generate_pattern_insights` endpoint reads the same flag and dispatches accordingly. Existing API shape unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `backend/tests/test_pattern_v2_candidate_generator.py`    | NEW. Cases: share normalization (raw count rising doesn't trigger if corpus grew proportionally — M1 plumbing), novelty bucket (baseline 0 + 5 recent → `novelty` not `volume_lift` — M2), corpus-size gate (window with < 50 total pillar mentions skips Mode B for that pillar — small-N noise floor), 14-day suppression (rejection from yesterday filters the entity out — M8).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `backend/tests/test_pattern_v2_pre_judge_weighting.py`    | NEW. Cases: story dedup drops 5 raw mentions sharing one `story_cluster_id` to 1 distinct story (M3 plumbing here too, even though the hard cross-pillar version lands in PR-4), SQI weighting (5 mentions at SQI 1.0 outranks 8 mentions at SQI 0.3 — M4), NULL SQI defaults to 0.5 not NULL, hard-floor drop (3 source-only mentions with distinct_story_count=1 → dropped), card confirmation flag set.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `backend/tests/test_pattern_v2_judge_service.py`          | NEW. Cases: diversified sampling (10 mentions all from pillar X get downsampled to ≤ 3 in the prompt; the remaining slots are filled from other pillars — M5), recent rejections injected when present, `decision=accept` writes `pattern_insights` row with `detector_version='v2'`, `decision=reject` writes `pattern_insight_rejections`, malformed JSON → reject with `rejection_reason='judge_parse_failure'`, **`confidence=0.99` and `decision=reject` still rejects** (M6 — never threshold confidence).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `backend/tests/test_pattern_v2_flag.py`                   | NEW. Verifies scheduler hook and the on-demand router dispatch on env var.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### Verification

```bash
cd backend && pytest tests/test_pattern_v2_candidate_generator.py tests/test_pattern_v2_pre_judge_weighting.py tests/test_pattern_v2_judge_service.py tests/test_pattern_v2_flag.py -v
cd backend && ruff check app/pattern_detection_v2/ app/scheduler.py app/routers/pattern_insights.py
npx supabase db push --linked

# Local end-to-end smoke (assumes PR-1 + PR-2 backfill ran):
export FORESIGHT_PATTERN_V2_ENABLED=true
python -c "import asyncio; from backend.app.pattern_detection_v2.runner import run_detection_v2; print(asyncio.run(run_detection_v2()))"

# Hand-eyeball 5+ candidates: 3 accepts and 2 rejects. For each, confirm the judge rationale
# matches the evidence sample shown. This is the qualitative gate before babysit auto-merges.
# Check pattern_insights for detector_version='v2' rows; check pattern_insight_rejections grew.
# Confirm usage_telemetry estimated_cost_usd is recorded for both mini (none in this PR's runtime path)
# and agent (the judge stage) calls.
```

### Babysit loop

Standard `/babysit-pr <N>`. **Run `/freview` before invoking babysit** — this PR changes the scheduler dispatch path and touches > 6 files (CLAUDE.md "Review gates" rule).

### Residual risks

- **Cold-start small-N regime.** With sparse early entity-mention coverage, the corpus-size gate (< 50 mentions/pillar/window) will suppress most pillars. Mitigation: leave the flag off in production for ~1 week of source-extraction accumulation before flipping it on. Document this in the PR description.
- **Judge prompt fragility.** A single ambiguously-phrased instruction can shift accept/reject rates. Establish a calibration set: 30 hand-labeled candidates pinned in `tests/fixtures/pattern_v2_calibration.json` (added in a follow-up cleanup PR if not in scope here). Any future judge prompt edit must hold ≥ 80% agreement with the calibration set.
- **Telemetry not double-counted.** The `_InstrumentedClientProxy` records every call. Don't manually `record_llm_usage_event` from the judge service — it'll show up twice.

---

## PR-4 — Modes A + C + coverage_gaps surface

**Branch:** `feat/pattern-v2-breadth-and-cooccurrence`

### Goal

Add the two remaining candidate modes and route source-only entities (rising in sources but no card-confirmation flag) to a new `coverage_gaps` surface — these are operationally distinct from "patterns we should act on" (`pattern_insights`) because they're _suggestions to write a card_, not insights to act on.

Backend-only — frontend Coverage Gaps UI lands in PR-5. (PR-4 stays narrow so it can babysit independently.)

### Math correctness items applicable

- **M3 story-cluster dedup** is enforced strictly in Mode A: `COUNT DISTINCT story_cluster_id FILTER (WHERE pillar_id = X) >= 3` per pillar; an entity that's "broad" only because the same press release was syndicated across 3 pillars does NOT clear the bar.
- **M7 Mode C bounded.** Mode C's input set is `entities surfaced by Mode A ∪ Mode B in the same window`. Typical size ≤ 50. No full-table self-join. Pair generation is `O(N²)` with N ≤ 50; triangle generation degrades gracefully if pair count > 200 (cap with a `LIMIT 200` ordered by combined sqi-weighted score).

### Schema changes (one migration: `<ts>_pattern_v2_coverage_gaps.sql`)

- `coverage_gaps` (new)
  - `id UUID PK`
  - `entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE`
  - `mode TEXT NOT NULL` (same enum as `pattern_insights`)
  - `window_days INTEGER NOT NULL`
  - `evidence_source_ids UUID[] NOT NULL DEFAULT '{}'` (top ~5 supporting `discovered_sources` IDs for the operator to click into)
  - `suggested_card_action TEXT` (judge-supplied: "create a card on X", "expand existing card Y")
  - `status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','dismissed','superseded'))`
  - `surfaced_at TIMESTAMPTZ DEFAULT NOW()`
  - `resolved_at TIMESTAMPTZ`
  - `prompt_version TEXT NOT NULL`
  - Indexes: `(status, surfaced_at DESC)` for the operator inbox, `(entity_id, status)` for dedup checks at insert time.
  - RLS: service-role full access; authenticated read+update (operators dismiss from the UI).
- Idempotent.

### Files changed

| Path                                                                                     | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/<ts>_pattern_v2_coverage_gaps.sql`                                  | NEW. Schema above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `backend/app/pattern_detection_v2/candidate_generator.py`                                | EXTEND. Add `async def generate_mode_a_candidates(window_days: int) -> list[ModeACandidate]`: SQL groups by entity_id, computes `pillar_count = COUNT(DISTINCT pillar_id) FILTER (WHERE COUNT(DISTINCT story_cluster_id) >= 1 OVER (entity_id, pillar_id))` — i.e., a pillar only "counts" toward breadth if at least one distinct story cluster shows the entity there (M3). Filter to `pillar_count >= 3`. Add `async def generate_mode_c_candidates(window_days: int, scope_entities: set[UUID]) -> list[ModeCCandidate]`: SQL operates only on `entity_mentions` rows whose `entity_id` is in `scope_entities` (M7). Pair-frequency CTE → triangle CTE (3-way self-join on a precomputed pair table). `LIMIT 200` pairs by combined sqi-weighted score before triangle enumeration. |
| `backend/app/pattern_detection_v2/runner.py`                                             | EDIT. After `generate_mode_b_candidates`, run `generate_mode_a_candidates`, union the entity sets, then run `generate_mode_c_candidates` scoped to that union (M7). Route each candidate per the rule: if `card_confirmation=False AND distinct_story_count >= 3` → `coverage_gaps` instead of running through the judge → `pattern_insights` path. (The judge still labels them, but writes to `coverage_gaps` with `suggested_card_action`.)                                                                                                                                                                                                                                                                                                                                          |
| `backend/app/pattern_detection_v2/judge_service.py`                                      | EDIT. Add `async def judge_coverage_gap(candidate) -> CoverageGapResult`. Same `gpt-5.4` agent tier, slightly different prompt — explicitly asks "should the team create a card on this, expand an existing card, or dismiss?" Output JSON: `{decision, suggested_card_action, urgency, confidence, reason}`. Persistence to `coverage_gaps` mirrors the existing accept/reject pattern.                                                                                                                                                                                                                                                                                                                                                                                                |
| `backend/app/routers/pattern_insights.py`                                                | EDIT. Add `GET /api/v1/coverage-gaps` with `status_filter`, `mode`, `window_days`, `limit` query params — symmetric with `get_pattern_insights`. Add `PATCH /api/v1/coverage-gaps/{id}` accepting `{status: 'accepted'                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 'dismissed'}`. Both Bearer-JWT via existing `get_current_user`. **Do not** put these on a new router file — keep them next to `pattern_insights` so the API surface stays cohesive. |
| `backend/app/models/pattern_insights.py` (if exists; else inline Pydantic on the router) | Add `CoverageGapOut`, `CoverageGapStatusUpdate` Pydantic models. Confirm location with `ls backend/app/models/` and register in `models/__init__.py` per the CLAUDE.md re-export convention.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `backend/tests/test_pattern_v2_mode_a.py`                                                | NEW. Cases: 3 pillars × 1 cluster each → pass (breadth=3); 3 pillars but 2 of them share story_cluster_id (syndication) → fail breadth (M3); pillar_id NULL on a mention is excluded from breadth count.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `backend/tests/test_pattern_v2_mode_c.py`                                                | NEW. Cases: pair frequency, triangle from 3 entities that co-occur in ≥ K mentions, scoping respected (entity outside the A∪B union never enters Mode C input — M7 plumbing), 200-pair cap ordering.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `backend/tests/test_coverage_gaps_routing.py`                                            | NEW. Cases: candidate with `card_confirmation=True` → judge writes `pattern_insights`; candidate with `card_confirmation=False AND distinct_story_count >= 3` → judge writes `coverage_gaps`; status update endpoint validates enum.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `backend/tests/test_coverage_gaps_router.py`                                             | NEW. Standard router test: auth required, list filters, PATCH status transitions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### Verification

```bash
cd backend && pytest tests/test_pattern_v2_mode_a.py tests/test_pattern_v2_mode_c.py tests/test_coverage_gaps_routing.py tests/test_coverage_gaps_router.py -v
cd backend && ruff check app/pattern_detection_v2/ app/routers/pattern_insights.py
npx supabase db push --linked

# Local end-to-end:
export FORESIGHT_PATTERN_V2_ENABLED=true
python -c "import asyncio; from backend.app.pattern_detection_v2.runner import run_detection_v2; print(asyncio.run(run_detection_v2()))"
# Confirm at least one coverage_gaps row exists if there are source-only rising entities; manual judgement of routing correctness.
curl -H "Authorization: Bearer $TEST_JWT" http://localhost:8000/api/v1/coverage-gaps?status=open
```

### Babysit loop

Standard `/babysit-pr <N>`. Run `/freview` first (touches > 6 files, modifies an admin-adjacent endpoint).

### Frontend deferral

PR-4 is backend-only. The UI for `coverage_gaps` (list view, dismiss/accept buttons, evidence drill-in) lives in PR-5 alongside the admin entity-merge tools so the whole operator surface ships coherently. Calling it out here so the PR description and the babysit bots are not confused by the absence.

### Residual risks

- **Mode C combinatorics.** Even with the 50-entity scope, dense periods (election news, budget cycle) can spike triangle counts. The `LIMIT 200` pair cap is the safety valve. If we see judge-stage cost spike, the cap drops to 100 — single-constant change.
- **Coverage-gap fatigue.** If 200 gaps surface in week 1, operators will tune out. Watch the dismiss rate during ramp; if > 80%, tighten the `distinct_story_count >= 3` floor to 5 before opening the surface to non-admin users.

---

## PR-5 — Retire v1 detector + operator tooling

**Branch:** `chore/retire-pattern-v1-add-admin-tools`

### Goal

Delete the v1 service, flip the flag default to `true`, surface the new `pattern_insight_rejections` + `coverage_gaps` to operators in the admin console, and ship the entity-merge/split tools so reconciliation mistakes are correctable without a SQL prompt.

### Math correctness items applicable

None new — this PR is operational. But it's the first PR where v2 runs in production by default, so the **calibration set rule** (PR-3 residual risk) becomes a hard gate: do not merge unless the calibration set holds ≥ 80% agreement with the pinned labels.

### Files changed

| Path                                                                                                                             | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/app/pattern_detection_service.py`                                                                                       | DELETE. 596 lines gone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `backend/app/scheduler.py`                                                                                                       | EDIT. Remove the `if FORESIGHT_PATTERN_V2_ENABLED` branch and the `from app.pattern_detection_service import PatternDetectionService` import. `run_nightly_pattern_detection` becomes a one-liner that calls `run_detection_v2()`. Flip the flag default in docs (`CLAUDE.md` env section + `.env.example`) to `true`.                                                                                                                                                                                                                                                                                                                              |
| `backend/app/routers/pattern_insights.py`                                                                                        | EDIT. Remove the v1 import + branch in `generate_pattern_insights`. Endpoint shape stays unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `backend/app/routers/admin.py` (or `admin_pattern_v2.py` — pick by file size; if admin.py is already large, create the new file) | NEW endpoints, all admin-only via `require_admin(current_user)`: `GET /api/v1/admin/pattern-rejections` (list/filter/pagination over `pattern_insight_rejections` — the audit/learn view), `GET /api/v1/admin/entities` (search by name/alias), `POST /api/v1/admin/entities/{id}/merge` (body `{target_entity_id}` — moves all `entity_mentions` + `entity_aliases` to the target, deletes the source entity; transactional), `POST /api/v1/admin/entities/{id}/split` (body `{mention_ids: UUID[], new_canonical_name, new_entity_type}` — moves listed mentions to a freshly created entity). All wrapped in `asyncio.to_thread` Supabase calls. |
| `backend/app/entity_reconciliation_service.py`                                                                                   | EDIT. Add `async def merge_entities(source_id, target_id) -> MergeSummary` and `async def split_entity(source_id, mention_ids, new_name, new_type) -> SplitSummary` so the admin endpoints stay thin. These ARE the canonical merge/split implementations; the admin endpoints are auth + thin glue. Include audit logging via `safety_incidents` table (already used by abuse monitor) or whatever the codebase's standard admin-audit substrate is — confirm via a quick `grep -r "admin.*audit"` before picking.                                                                                                                                 |
| `frontend/foresight-frontend/src/pages/AdminConsole/tabs/PatternsTab.tsx` (new, or extend an existing tab)                       | NEW. Three sub-panels: (1) **Rejections audit** — read-only list of `pattern_insight_rejections` with filter by mode/window, sortable by `judged_at`, click-through to the candidate snapshot. (2) **Entity tools** — search box, click an entity, see its mentions/aliases, two buttons: "Merge into …" (modal with target search) and "Split off …" (modal selecting which mentions). (3) **Coverage gaps inbox** — list of `coverage_gaps` with dismiss/accept buttons.                                                                                                                                                                          |
| `frontend/foresight-frontend/src/lib/pattern-insights-api.ts` (new or extend existing)                                           | New clients: `fetchPatternRejections`, `searchEntities`, `mergeEntities`, `splitEntity`, `fetchCoverageGaps`, `updateCoverageGapStatus`. Standard `apiRequest<T>` pattern from `lib/config.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `frontend/foresight-frontend/src/components/admin/EntityMergeModal.tsx`, `EntitySplitModal.tsx`                                  | NEW. Radix dialog primitives, match existing admin modal patterns.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `backend/tests/test_admin_entity_merge.py`                                                                                       | NEW. Cases: merge moves mentions and aliases atomically; rolls back on partial failure; merging an entity into itself errors; non-admin returns 403.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `backend/tests/test_admin_entity_split.py`                                                                                       | NEW. Cases: split moves exactly the listed mentions; remaining mentions stay on the source entity; new entity row is created with the supplied canonical/type.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `frontend/foresight-frontend/src/pages/AdminConsole/tabs/__tests__/PatternsTab.test.tsx`                                         | NEW. Vitest. Smoke test for each panel render + one user-interaction (dismiss a coverage gap → API client called).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### Verification

```bash
cd backend && pytest tests/test_admin_entity_merge.py tests/test_admin_entity_split.py tests/test_pattern_v2_* -v
cd backend && ruff check app/ scripts/ tests/
cd frontend/foresight-frontend && pnpm test:run && npx tsc -b --noEmit && pnpm lint
npx supabase db push --linked  # if any tooling-only migration ended up needed; otherwise skip

# Full E2E (production-shaped): on a copy of the prod DB or a beefy seed dataset:
export FORESIGHT_PATTERN_V2_ENABLED=true
# 1) Run a discovery cycle from admin console → confirm new sources tag (PR-2 hook).
# 2) Run pattern detection → inspect pattern_insights v2 rows + rejections + coverage_gaps.
# 3) In admin UI: search for an over-merged entity, click Split, choose mentions, save. Re-run detection; confirm
#    candidates now distinguish the two entities.
# 4) Confirm calibration set still holds ≥ 80% agreement (run the calibration script committed in this PR).

# Search for any lingering v1 references:
grep -rn "pattern_detection_service\|PatternDetectionService\|STRATEGIC_PILLARS\s*=" backend/ frontend/foresight-frontend/src/ || echo "clean"
```

### Babysit loop

Standard `/babysit-pr <N>`, but pass `--no-merge` — this PR flips the flag default and deletes a 596-line service. Manual final-look before merge is the safer ergonomic. After review, manual `gh pr merge <N> --squash --delete-branch`.

### Residual risks

- **Cutover regret.** If v2 misbehaves in production after the flag default flips, rollback is one env var (`FORESIGHT_PATTERN_V2_ENABLED=false`) — but only if the v1 service is still in the tree. Since we delete it in this PR, rollback means reverting the PR. Mitigation: keep a tagged commit at `pre-v1-retire` so `git revert` is one command.
- **Operator tool blast radius.** Merge/split is destructive on `entity_mentions`. Both endpoints write to an admin audit log; both should refuse to operate on entities with > 1000 mentions in a single call (chunk via a follow-up cleanup task). Add this guard explicitly.

---

## Cross-cutting verification (after all 5 PRs land)

- `gh pr list --state closed --search "is:merged author:@me created:>2026-05-13"` should show 5 squash-merges in order PR-1 → PR-2 → PR-3 → PR-4 → PR-5.
- `grep -rn "STRATEGIC_PILLARS\s*=\s*\[" backend/app/` returns nothing (CH/MC/HS/EC/ES/CE retired).
- `grep -rn "from app\.pattern_detection_service" backend/` returns nothing.
- `pattern_insights` queryable: `detector_version='v2'` rows exist; `entity_id`, `mode`, `window_days` populated on every v2 row.
- `pattern_insight_rejections` has rows with non-empty `candidate_snapshot` JSONB and persisted `judge_confidence` floats — but no code in the repo compares `judge_confidence` against a numeric threshold (`grep -rn 'judge_confidence\s*[<>]' backend/` → empty) (M6 enforced).
- `usage_telemetry` filter `where operation like 'openai.%' and created_at > now() - interval '1 day'` shows non-NULL `estimated_cost_usd` on every row from both the mini (extraction) and agent (judge) tiers.
- `coverage_gaps` accessible at `GET /api/v1/coverage-gaps?status=open`; admin can dismiss via the UI.
- Calibration set agreement (PR-5 script) ≥ 80% on a stable test set.
- Nightly scheduler job runs end-to-end without `BudgetExceededError` once on a typical day; trips cleanly when the daily budget is artificially lowered.

## Out of scope (deliberate)

- **Per-claim extraction beyond stance.** We extract `{canonical, aliases, type, salience, stance}` per entity per item — not claim-level "X causes Y" relations. That's a much bigger surface and a different prompt category.
- **Geographic relevance scoring.** Some entities are place-bound (a Houston program shouldn't surface as an Austin pattern unless explicitly relevant). For v1 we rely on the source corpus already being Austin-focused at the discovery layer; geo-disambiguation is a follow-up.
- **Auto-card-creation from coverage gaps.** Surface only — no automatic card materialization. The operator clicks "Accept" and the existing `signal_agent_service` card-creation flow takes over. Connecting these directly is a separate PR.
- **Cross-version reconciliation.** Same canonical name under prompt_version v1 and v2 are different rows by design. A v1→v2 entity migration is a separate operational task (likely an offline notebook), not part of this stack.
- **Real-time judge.** Detection runs on the nightly schedule. On-demand `/generate` is convenience-only and uses the same code path. No streaming/incremental detector in v2.

## Babysit-loop contract (applies to all 5 PRs)

After `gh pr create`:

1. Run `/babysit-pr <N>`. The agent spawns `pr-babysitter` on a self-paced loop.
2. The bot polls CodeRabbit, Codex, Greptile, Sourcery comments on each tick.
3. For each new comment: push a fix OR reply with reasoning if we disagree.
4. Re-runs the PR's verification block on every push.
5. Exits "clean" after two consecutive quiet ticks with green CI.
6. **Default: auto-squash-merges with `--delete-branch`** (CLAUDE.md PR workflow says this is the default for `/babysit-pr`).
7. Exception: **PR-5 invokes `/babysit-pr <N> --no-merge`** — the v1 deletion + flag flip warrants a manual final-look before merge.
8. Run `/freview` BEFORE babysit on PR-3 and PR-4 (each touches > 6 files, scheduler/router edits per CLAUDE.md review-gate rule).

This matches the working pattern from prior PRs in this repo.

---

## Honest residual risks (top-level summary)

1. **Multi-layer LLM compounding.** Triage → analysis → extraction → judge stacks four LLMs. If any single stage drifts (a model update, a prompt regression), downstream effects are non-linear. Mitigations: prompt versioning at every stage (`CLASSIFIER_VERSION`, `EXTRACTION_PROMPT_VERSION`, `JUDGE_PROMPT_VERSION`); calibration set on the judge; periodic operator review of `pattern_insight_rejections`.
2. **Cold-start small-N regime.** During the first ~1-2 weeks after extraction backfill, per-pillar mention counts are sparse and the corpus-size gate (< 50 mentions/pillar/window) will suppress most candidates. This is correct behavior — surfacing noise during ramp poisons trust — but should be called out in the PR-3 description so operators don't panic when "nothing happens."
3. **Reconciliation false-merges.** Cosine 0.85 + alias-overlap is a heuristic. Some near-synonym entity pairs ("Section 8" vs "Housing Choice Voucher") will merge; some legitimate variants ("MetroRail" vs "MetroRail Red Line") may stay split. PR-5 admin merge/split tools exist for exactly this reason. Plan to review the top-100 most-mentioned entities weekly during ramp.
4. **Cost ceiling.** PR-2 backfill is the single most expensive operation we've ever placed via this codebase. The `check_budget_or_skip` gate makes it safe; the `--limit` + `--rate-limit-sleep` flags make it controllable. Run during off-hours, watch `usage_telemetry` sum every 10 minutes during the first pass.

### Critical Files for Implementation

- `backend/app/csp_goal_query_service.py` — operational template (versioned-prompt + cache-on-row + JSON parsing) that the extraction and judge services mirror directly.
- `backend/app/pattern_detection_service.py` — the v1 service to read in PR-1/PR-2 (to confirm we're not regressing user-visible behavior) and delete in PR-5.
- `backend/app/discovery_service.py` (lines 3510-3525) — the integration site where PR-2 wires real-time extraction in immediately after `cluster_sources`, with `story_cluster_id` already available for M3 plumbing.
- `backend/app/scheduler.py` (lines 275-293) — the scheduler hook that PR-3 puts behind a flag and PR-5 simplifies; the canonical place to wire `run_detection_v2`.
- `supabase/migrations/1766435002_discovered_sources.sql` — the source-of-truth schema confirming `content_snippet` + `content_embedding VECTOR(1536)` + `triage_primary_pillar`; the columns PR-2 reads when building per-source extraction payloads and the place we add `concept_tags` + `concept_tags_version`.
