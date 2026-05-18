# 03 — AI Pipeline

Everything model-shaped. Tiers, where they're used, how RAG and the signal
agent fit together, and where the rules live in code.

The canonical model table also lives in [CLAUDE.md](../CLAUDE.md). If they
disagree, the code in `backend/app/openai_provider.py` wins — update both.

## Model tiers

All model selection goes through `app/openai_provider.py`. **Do not hardcode
model names** in services — use the tier helpers below. Changing a model
should be a single env-var or config edit.

| Tier               | Default                                                                                | Env override              | Used for                                                                        |
| ------------------ | -------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------- |
| `model_chat`       | `gpt-5.4-2026-03-05`                                                                   | `OPENAI_CHAT_MODEL`       | User-facing chat, executive briefs                                              |
| `model_chat_agent` | `gpt-5.4-2026-03-05`                                                                   | `OPENAI_CHAT_AGENT_MODEL` | Signal agent + agentic tool use                                                 |
| `model_chat_mini`  | `gpt-5.4-mini-2026-03-17`                                                              | `OPENAI_CHAT_MINI_MODEL`  | Triage, classification, query expansion, RAG reranking, chat suggestions/titles |
| `model_chat_nano`  | falls back to mini                                                                     | `OPENAI_CHAT_NANO_MODEL`  | Reserved (no separate nano tier in production yet)                              |
| `model_embedding`  | `text-embedding-ada-002` (and only ada-002 is currently in `ALLOWED_EMBEDDING_MODELS`) | `OPENAI_EMBEDDING_MODEL`  | Card + source + chat embeddings (1536-dim, pgvector)                            |

Helpers (all in `openai_provider.py`):

- `get_chat_deployment()`, `get_chat_agent_deployment()`,
  `get_chat_mini_deployment()`, `get_chat_nano_deployment()`,
  `get_embedding_deployment()`, `get_reasoning_effort()`.
- Or access via the `_config.model_*` attributes on the shared `OpenAIConfig`.

Allowlists (`ALLOWED_CHAT_MODELS`, `ALLOWED_EMBEDDING_MODELS`) guard against
typos and prevent a stray model name from leaking into a request. If you add
a new model, extend the allowlist in the same change.

The `app/usage_telemetry.py` pricing table intentionally lists more models
than are routed to — it powers cost-waterfall projections (what spend would
look like under hypothetical routings). Don't prune entries unless asked.

## Why these defaults

- **gpt-5.4** for user-visible writing (chat, briefs) and the signal agent
  where tool use + reasoning quality matter.
- **gpt-5.4-mini** for everything that runs at scale: query expansion,
  reranking, triage decisions where a wrong answer is recoverable.
- **GPT-5.5 retired**: do not route to it. Older references in comments or
  docstrings are stale.
- **Azure migrated off**: the commercial OpenAI API is the only path. The
  module is still named `openai_provider` and exposes Azure-prefixed symbols
  for backward compatibility with callers — but they don't go to Azure.

## Embeddings

- 1536-dim, written into the `cards`, `sources`, and chat history tables.
- The code default is `text-embedding-ada-002`, and the allowlist
  (`ALLOWED_EMBEDDING_MODELS` in `openai_provider.py`) currently locks to
  ada-002 only — overriding `OPENAI_EMBEDDING_MODEL` to anything else is
  rejected until the allowlist is extended.
- Rotating to a new embedding model is a two-step change: extend the
  allowlist, then run the embedding-backfill admin endpoint to re-embed
  existing rows. Mixing two embedding models in the same column silently
  breaks similarity search and card dedup — same dimensionality satisfies the
  pgvector column type, but the latent spaces differ, so cross-model cosine
  distances are meaningless.
- Empty embedding crashes pgvector RPCs → use zero vector `[0.0]*1536` as a
  fallback.
- pgvector cosine threshold for card-dedup matching: **0.92**.
- pgvector operators live in the `extensions` schema. SQL functions called
  via `.rpc(...)` need `SET search_path = extensions, public` at the top.

## RAG / chat pipeline (`app/rag_engine.py`)

`RAGEngine.retrieve(...)` is the entry point. Pipeline:

1. **Query expansion** — `_expand_query` with the mini tier turns the user
   question into several related queries.
2. **Embedding** — `_generate_embedding` (single call; empty input falls
   back to the zero vector).
3. **Hybrid search** — `_hybrid_search` calls two SQL functions,
   `hybrid_search_cards()` and `hybrid_search_sources()`. Both do
   tsvector-FTS + pgvector + Reciprocal Rank Fusion in-DB.
4. **Scope enrichment** — `_enrich_signal` / `_enrich_workstream` /
   `_enrich_global` pull in the things you'd want around a result (sources,
   timeline, research, kanban context). Uses `asyncio.gather` for parallel
   fetches.
5. **Mention resolution** — `_resolve_mentions` looks up explicit `@card`
   / `@workstream` references in the prompt.
6. **LLM reranking** — `_rerank_results` (mini tier) re-orders the candidate
   set for relevance.
7. **Context assembly** — `_assemble_context` budgets to ~120K characters
   (~30K tokens), then `max_tokens=8192`, history window 20 messages.

Citation indexing rule: use `max(source_map.keys(), default=0) + 1`. The map
is sparse — `len(source_map)` is wrong and will collide indices.

FTS rule: `websearch_to_tsquery` chokes on `() : < > ! | &`. Run user input
through `_sanitize_fts_query(q)` first. Same energy for Supabase `.ilike()`,
which does **not** escape `%` / `_` — sanitize before searching.

## `web_search` tool (chat)

- Implemented in `app/chat_tools.py`, backed by Serper + SearXNG.
- Only offered to the model when at least one provider is configured.
- Max 2 searches per message, 10s timeout per call.
- The streaming loop **must** return a tool response for every tool_call,
  including unknown tools or "limit reached" cases — otherwise the model
  stalls waiting for the next message.
- **Never reintroduce Tavily** (decommissioned).

## Signal agent (`app/signal_agent_service.py`)

This is the production card-creation path. `_execute_create_signal(...)`
does the lens hook (CSP + PPP enrichment), classification, scoring, and
dedup. The earlier `discovery_service._create_card` path is a fallback —
**maintain lens logic on the signal_agent path**, not on `_create_card`.

Lens columns on `cards` are the full set: `csp_goal_ids`, `csp_measure_ids`,
`anchor_*`. They are not `csp_codes` / `strategic_anchors` (those names
appear in old planning docs and are wrong).

## Discovery pipeline (`app/discovery_service.py`)

Fetch → triage (mini tier) → enrich (`content_enricher`) → signal_agent →
card creation, with `_persist_discovered_source` running **before** triage
so paid-for URLs survive an LLM analysis failure.

Job state flows through `job_events` (`JOB_DISCOVERY`). Direct invocation
from a script needs `asyncio.wait_for(..., timeout=1800)`.

## Brief + deep research

- `brief_service` runs executive brief and portfolio brief generation via
  gpt-5.4. Long generations run in the worker (`JOB_BRIEF`).
- `research_service` wraps gpt-researcher; both gpt-researcher and the chat
  `web_search` tool go through Serper + SearXNG. Tavily / Firecrawl code
  paths are removed — don't re-add them.

## Telemetry

- Cost column is **`estimated_cost_usd`**. Writing the column name `cost_usd`
  silently returns `$0` with no error — `app/usage_telemetry.py` has the
  insert path.
- All LLM calls go through the instrumented `openai_client` proxy in
  `openai_provider.py`, which emits the usage row.

## Search providers

- **Allowed**: Serper (Google API) + SearXNG (self-hosted aggregator,
  `docker-compose.yml` + `searxng/`).
- **Banned**: Tavily, Firecrawl. API keys are off; no code path may call
  them. Re-adding either should fail review.
