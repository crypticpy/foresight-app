# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Foresight is an AI-powered strategic horizon scanning system for the City of Austin. It automates discovery, analysis, and tracking of emerging trends, technologies, and issues that could impact municipal operations, aligned with Austin's strategic framework and the CMO's Top 25 Priorities.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS + Radix UI
- **Backend**: FastAPI (Python 3.11+) with Pydantic
- **Database**: Supabase (PostgreSQL + pgvector for vector search)
- **AI/ML**: OpenAI (commercial API, not Azure — `openai_provider.py` retains Azure-prefixed symbols only for caller compatibility). Live model tiers (defaults; configurable via env vars `OPENAI_CHAT_*_MODEL`):
  - `model_chat` / `model_chat_agent` — `gpt-5.4` (user-facing chat, briefs; signal agent + agentic tool use)
  - `model_chat_mini` — `gpt-5.4-mini` (cascade dimensions, query expansion, RAG reranking)
  - `model_chat_nano` — falls back to mini; only override after sampling
  - `model_embedding` — `text-embedding-ada-002` (kept on ada-002 for pgvector compatibility with existing 1536-dim card embeddings)
  - gpt-researcher for deep research, routed through the agent + mini tiers
  - **GPT-5.5 is retired** — do not route to it. GPT-4.1 references in older comments/docstrings are stale.
- **Web search providers**: SearXNG (self-hosted aggregator) + Serper (Google API) only. **Tavily and Firecrawl are decommissioned** — their API keys are off and no code path may call them. gpt-researcher and chat `web_search` both go through the Serper/SearXNG providers.
- **Auth**: Supabase Auth (JWT-based)

## Development Commands

### Backend

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000  # API server (also runs an embedded worker by default)
python -m app.worker                                        # Standalone worker (only needed if FORESIGHT_EMBED_WORKER=false)
pytest                                                      # Run all tests
pytest tests/test_discovery_queue.py -v                     # Run single test file
pytest tests/test_foo.py::test_bar                          # Run a single test
ruff check .                                                # Lint
```

### Frontend

```bash
cd frontend/foresight-frontend
pnpm dev                    # Development server (port 5173)
pnpm build                  # Production build
pnpm lint                   # ESLint
pnpm test                   # Vitest unit tests (watch mode)
pnpm test:run               # Vitest unit tests, single run
pnpm test:e2e               # Playwright E2E tests
pnpm test:e2e:headed        # E2E with browser visible
npx tsc -b --noEmit         # Strict type-check. Use `-b` (build mode) — the frontend uses TS project references,
                            # so plain `tsc --noEmit` silently passes while real errors hide. Always use `-b`.
```

### Database

Migrations are in `supabase/migrations/`. Filename convention: `YYYYMMDDHHMMSS_description.sql`.

```bash
npx supabase db push        # Push pending migrations to remote Supabase
```

### Available CLIs

These CLIs are installed, authenticated, and ready to use directly — prefer them over asking the user to run manual steps:

- **Supabase CLI** (`npx supabase`) — push migrations, manage DB, run SQL
- **Vercel CLI** (`vercel`) — check deployments, manage environment variables
- **GitHub CLI** (`gh`) — create PRs, view issues, manage repos

## Architecture

### Backend (`backend/app/`)

The backend was decomposed from an 11K-line `main.py` monolith into a slim app factory plus 22 routers and 25+ Pydantic model modules. **Do not add new endpoints to `main.py`** — pick or create the right file under `routers/`.

- `main.py` (~230 lines) — app factory: CORS, security middleware, lifespan (scheduler + embedded worker), router registration. To wire a new router: add the import and an `application.include_router(...)` call.
- `routers/` — every HTTP endpoint. Naming: `routers/<feature>.py`. All routers use the `/api/v1` prefix; user-scoped endpoints use `/api/v1/me/...`.
- `models/` — Pydantic request/response types. The package's `__init__.py` re-exports every public symbol; new models must be added to both the file _and_ the `__init__.py` import list + `__all__`.
- `deps.py` — shared singletons and dependencies: `supabase` client, `openai_client`, `get_current_user` (verifies JWT, has a 5-min TTL profile cache wrapped in `asyncio.to_thread`).
- `scheduler.py` — APScheduler nightly/weekly jobs. Started only when `FORESIGHT_ENABLE_SCHEDULER=true`.
- `worker.py` — `ForesightWorker` background job processor (discovery runs, deep research, brief generation, scans). Runs as a separate Railway service in production. Locally, it runs **embedded inside the API process** by default (`FORESIGHT_EMBED_WORKER=true`).
- `security.py` — rate limiting, security headers, request-size limits. Sensitive endpoints use `@rate_limit_*` decorators.
- Domain services (used by routers and the worker):
  - `ai_service.py` — classification, scoring, analysis
  - `discovery_service.py` — content discovery pipeline + processing
  - `research_service.py` — gpt-researcher integration
  - `brief_service.py` — executive brief generation + portfolio synthesis
  - `chat_service.py` + `rag_engine.py` — SSE chat orchestrator and hybrid RAG (FTS + pgvector via RRF)
  - `chat_tools.py` — `web_search` tool for chat, backed by Serper / SearXNG (Tavily path removed)
  - `signal_agent_service.py` — production card-creation path (`_execute_create_signal`). The lens hook (CSP/PPP enrichment) lives here, **not** on `discovery_service._create_card`. Maintain lens logic on the signal_agent path.
  - `gamma_service.py` — Gamma API integration for AI-generated decks (with local PPTX/PDF fallback)
  - `export_service.py` — PDF/PPTX/CSV export
  - `portfolio_export.py` — shared portfolio render pipeline used by both `/bulk-brief-export` and `/portfolios/{id}/export`
  - `openai_provider.py` — centralized Azure OpenAI client config
  - `source_fetchers/` — RSS, NewsAPI, etc.

### Frontend (`frontend/foresight-frontend/src/`)

- `App.tsx` — router setup; lazy-loads page components and registers protected routes.
- `pages/` — route components (Dashboard, Discover, Workstreams, WorkstreamKanban, PortfolioDetail, etc.).
- `components/` — reusable UI; notable subdirs:
  - `components/ui/` — shadcn/ui base components
  - `components/kanban/` — workstream kanban board
  - `components/portfolios/` — portfolio modals
- `lib/` — API clients and shared utilities. **One file per backend feature**:
  - `config.ts` — single source for `API_BASE_URL`
  - `discovery-api.ts`, `workstream-api.ts`, `analytics-api.ts`, `portfolios-api.ts`, etc.
  - All clients follow the same `apiRequest<T>(endpoint, token, options)` helper pattern.
- `hooks/` — including `useAuthContext` and `useChat` (chat UI state with sessionStorage cache + Supabase persistence).

### Key Domain Concepts

- **Cards** — atomic units of strategic intelligence with metadata (pillar, stage, horizon, multi-factor scores).
- **Strategic Pillars** (codes in DB; full names in `backend/app/taxonomy.py`):
  - `CH` Community Health & Sustainability
  - `EW` Economic & Workforce Development
  - `HG` High-Performing Government
  - `HH` Homelessness & Housing
  - `MC` Mobility & Critical Infrastructure
  - `PS` Public Safety
- **Maturity stages** (card-level): Concept → Exploring → Pilot → PoC → Implementing → Scaling → Mature → Declining.
- **Multi-factor scoring** (0–100 each): Impact, Relevance, Velocity, Novelty, Opportunity, Risk.
- **Workstreams** — user-created research streams. Have an `owner_type` of `user` or `org`; org-owned workstreams are read-only and visible to all users.
- **Kanban statuses** (per-workstream-card, distinct from card maturity): `inbox`, `working`, `ready`, `archived`. `is_watching` is a separate orthogonal flag.
- **Portfolios** — curated card collections (≤15 cards), scoped to a workstream or cross-workstream (`workstream_id` is nullable). Drive PDF/PPTX export.
- **Discovery Queue** — personalized card recommendations.

### Chat / RAG Architecture

- `rag_engine.py` runs hybrid FTS + vector search via Reciprocal Rank Fusion. SQL functions: `hybrid_search_cards()` and `hybrid_search_sources()` (require `SET search_path = extensions, public` for pgvector operators).
- Pipeline: query expansion → embedding → hybrid search → scope enrichment → LLM reranking → context assembly. Context budget ~120K chars, max_tokens 8192, conversation history 20 messages.
- All three scopes (signal / workstream / global) use the same engine with scope-specific enrichment.
- `web_search` is offered to the model only when a Serper/SearXNG provider is configured (see `chat_tools.py`). Max 2 searches/msg, 10s timeout. The streaming loop must return a tool response for **every** tool_call, including unknown tools or limit-reached cases. **Do not reintroduce Tavily.**
- Citation indices use `max(source_map.keys(), default=0) + 1` — **never** `len(source_map)`, since keys can be non-contiguous.

## Environment & Feature Flags

### Backend (`backend/.env`)

```
SUPABASE_URL=
SUPABASE_KEY=
SUPABASE_SERVICE_KEY=
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_DEPLOYMENT=
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=
SERPER_API_KEY=                 # Google search via Serper (chat web_search + gpt-researcher)
SEARXNG_URL=                    # Self-hosted SearXNG aggregator (chat web_search + gpt-researcher)
# NOTE: Tavily and Firecrawl are decommissioned. Do not set TAVILY_API_KEY / FIRECRAWL_API_KEY,
# and do not re-add code paths that read them.

# Runtime flags (read in main.py lifespan)
FORESIGHT_EMBED_WORKER=true     # Default: embed the worker in the API process. Set false to run the worker separately.
                                # PRODUCTION: must be false on foresight-api when foresight-worker is deployed.
                                # Historical reason: gunicorn (4 procs, 120s silence timeout in entrypoint.sh) used to
                                # SIGTERM gunicorn workers pinned by long deep-research tasks, killing the asyncio task
                                # and its heartbeat. PR #62 replaced the heartbeat thread with the job_events substrate
                                # (see Worker Jobs below) which is more resilient, but the split-service deployment is
                                # still the supported topology.
FORESIGHT_ENABLE_SCHEDULER=false # Default: APScheduler off. Production web service sets this true.
FORESIGHT_DEMO_FREEZE=false     # When true, suppresses scheduler + embedded worker auto-fires (RSS triage, scheduled discovery). User-initiated jobs still run. Use this to keep API spend at zero during demos.
ENVIRONMENT=development|production # Controls strict CORS validation
ALLOWED_ORIGINS=                # Comma-separated; production rejects non-HTTPS and localhost origins
```

### Frontend (`frontend/foresight-frontend/.env`)

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=http://localhost:8000
```

## API & Data Conventions

- All endpoints under `/api/v1/`; user-scoped endpoints use `/api/v1/me/...`.
- Authentication via Bearer JWT; `Depends(get_current_user)` enforces it.
- Rate limiting on sensitive endpoints via `@rate_limit_*` decorators in `security.py`.
- Org-owned-vs-user authorization pattern: read endpoints check `if ws.get("owner_type") != "org" and ws.get("user_id") != user_id: raise 404` (404, not 403, to avoid leaking existence).
- RLS is enabled on all Supabase tables. Use the service-role client (`supabase` from `deps.py`) on the server.
- pgvector: 0.92 cosine similarity threshold for card-deduplication matching.
- Supabase JSONB columns: pass Python `dict`/`list` directly — **do not** `json.dumps()` first.
- Supabase sync client blocks the event loop; in async paths wrap calls with `asyncio.to_thread(...)`.
- `websearch_to_tsquery` breaks on `():<>!|&` chars — sanitize via `_sanitize_fts_query()` before passing user input.
- Supabase `.ilike()` does **not** escape `%`/`_` metacharacters; sanitize first.
- Always use timezone-aware datetimes: `datetime.now(timezone.utc)`. Don't strip tzinfo from DB timestamps.
- **Telemetry cost column is `estimated_cost_usd`** — not `cost_usd`. Writing the wrong name silently returns $0 with no error.
- **Model selection goes through `openai_provider.py` — never hardcode model names.** Use the tier helpers (`get_chat_deployment`, `get_chat_agent_deployment`, `get_chat_mini_deployment`, `get_chat_nano_deployment`, `get_embedding_deployment`) or the `_config.model_*` attributes. Do not pass literal strings like `"gpt-5.4"` or `"gpt-4.1"` to the client. Changing a model should be a single env-var / config edit.
- **The `usage_telemetry.py` pricing table is intentionally broader than the live model set.** It powers the cost-waterfall projection feature (forecasting per-user spend if we hypothetically routed to other tiers). Adding/removing entries there is a forecasting decision, not a cleanup target — leave retired-but-priced models in unless explicitly asked to prune.

## Worker Jobs

The worker handles discovery pipeline runs (fetching, triage, classification), deep research (gpt-researcher), executive brief generation, and workstream scans. Jobs time out after a configured duration and are marked failed. The worker imports from `app.deps`, `app.models.*`, `app.routers.*`, and `app.scheduler` — keep those import paths stable.

### `job_events` observability substrate (PRs #58, #61, #62)

Long-running jobs no longer rely on the legacy heartbeat thread. They emit structured records into the `job_events` table:

- **What writes to it**: research_service, signal_agent, discovery pipeline phases, brief generation. Each phase logs a `started` / `progress` / `completed` / `failed` event with a payload (status, counts, cost, error).
- **Who reads it**: status endpoints, the worker health probe, and any UI that surfaces job progress. Prefer querying `job_events` over scraping logs for job state.
- **Heartbeat rule (PR #58)**: heartbeats must be written off the event loop — wrap the Supabase insert in `asyncio.to_thread(...)`. A heartbeat written inline inside a blocking call (e.g. a sync HTTP request) will skip and trip the "no heartbeat" failure path.
- **No race-condition status flips (PR #61)**: terminal status writes (`completed` / `failed`) must check the current status before overwriting, otherwise a late heartbeat can revert a failed job back to `running`.
- **Direct-invocation timeout**: scripts that call discovery/signal_agent outside the worker must wrap the call in `asyncio.wait_for(..., timeout=1800)` — anything tighter cuts off signal_agent + card creation mid-flight.

## Testing

Backend tests use pytest with async support. Frontend uses Vitest for unit tests and Playwright for E2E.

Test user credentials for local development live in `backend/.env` (gitignored) as `TEST_USER_EMAIL` / `TEST_USER_PASSWORD`. The `create_test_user.py` script provisions the user in Supabase from those env vars.

## Deployment

- **Railway** runs two services: web (FastAPI + embedded worker by default) and an optional standalone worker. Auto-deploys on push to `main`. Health checks: `/api/v1/health` (web), `/api/v1/worker/health` (worker).
- **Vercel** auto-deploys the frontend from `main`. The Vercel project is `foresight-frontend` (not `foresight-app`).

## PR workflow

This repo prefers many small, targeted PRs over one big one. The pattern below is the default for any non-trivial change.

- **Chop work into targeted PRs.** Each PR should have one clear purpose ("delete dead alias layer", "centralize model defaults", "fix stale docstrings") and a small diff. If you find yourself making three unrelated changes in one branch, split before pushing. A 30-line PR ships faster than a 300-line PR every time.
- **Commit often, PR often.** Don't accumulate work locally across a session before pushing — every coherent unit gets its own branch, commit, and PR. The cost of an extra branch is near-zero; the cost of a tangled diff is days of review churn.
- **Branch naming.** `<type>/<short-slug>` matching the conventional-commit prefix: `refactor/remove-model-alias-table`, `fix/heartbeat-event-loop`, `docs/claude-md-model-stack`.
- **After opening a PR, run `/babysit-pr <N>`.** That skill spawns the `pr-babysitter` agent on a self-paced `/loop` that:
  1. Polls the PR for CodeRabbit, Codex, Greptile, and Sourcery review comments.
  2. Reads each comment as it lands.
  3. Addresses the feedback (push a fix or reply with reasoning if we disagree).
  4. Loops until every comment is resolved and CI is green for two consecutive quiet ticks.
  5. **Auto-squash-merges** with `--delete-branch` once clean. Pass `--no-merge` if you want to gate merge on yourself instead.
- **Babysit auto-merge is the default.** The `pr-babysitter` agent has explicit authorization to run `gh pr merge <N> --squash --delete-branch` once it observes two consecutive quiet ticks + green CI. This overrides the older "final merge stays with the maintainer" rule for that specific workflow. Use `--no-merge` for any PR where you want a manual final-look.
- **One PR in flight per change.** Don't start the next targeted PR's work on top of an unmerged branch unless they genuinely depend on each other. Stack only when necessary; otherwise branch fresh from `main`.

This workflow is why CLAUDE.md, `openai_provider.py`, `research_service.py`, and stale-docstring fixes ship as four separate PRs rather than one — even though they all touch the "model stack cleanup" theme.

## Code hygiene: fix-as-you-go

This codebase has no external contributors — only the maintainer and AI agents. There is no "someone else's code" to leave alone. Pre-existing lint warnings, dead imports, and small style issues compound if every agent ignores them, so the rule is: when you touch a file, leave it cleaner than you found it.

- **Touched-file rule.** If you edit a file and `ruff check` or `eslint` reports issues in it, fix the in-file issues as part of the same change. Don't open a separate PR for trivia in the file you're already editing.
- **Auto-fix what's safe.** `ruff check --fix` and `eslint --fix` for `F401` (unused imports), `F541` (f-strings without placeholders), unused `eslint-disable` directives, and similar mechanical fixes. Run them on the files you touched; don't blanket-apply across the repo in a feature PR.
- **Don't bypass.** Do not silence with `# noqa`, `eslint-disable`, `// @ts-ignore`, or `--no-verify` to make a check pass. If a rule genuinely doesn't fit, change the rule config in `pyproject.toml` / `eslint.config.js` and explain why in the commit. The codebase shouldn't accumulate per-line escape hatches.
- **Cleanup PRs are welcome.** When you notice a cluster of pre-existing issues outside the files you're touching (e.g., the `backend/scripts/` ruff backlog), open a separate small PR scoped to that cleanup rather than mixing it into a feature change. Document anything you deliberately leave alone (e.g. "intentional pattern to avoid re-render loop").
- **`react-hooks/exhaustive-deps` deserves judgment.** Some of these warnings are intentional — adding the dep would cause a re-render loop. When you keep one, leave a one-line comment explaining why; don't just add `// eslint-disable-next-line`.
