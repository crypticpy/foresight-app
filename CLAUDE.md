# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Foresight is an AI-powered strategic horizon scanning system for the City of Austin. It automates discovery, analysis, and tracking of emerging trends, technologies, and issues that could impact municipal operations, aligned with Austin's strategic framework and the CMO's Top 25 Priorities.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS + Radix UI
- **Backend**: FastAPI (Python 3.11+) with Pydantic
- **Database**: Supabase (PostgreSQL + pgvector for vector search)
- **AI/ML**: Azure OpenAI (GPT-4.1 / GPT-4.1-mini, embeddings), gpt-researcher for deep research
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
npx tsc --noEmit            # Strict type-check (always run after edits — TS strict mode is on)
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
  - `chat_tools.py` — Tavily-backed `web_search` tool for chat
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
- `web_search` is offered to the model only when `TAVILY_API_KEY` is set. Max 2 searches/msg, 10s timeout. The streaming loop must return a tool response for **every** tool_call, including unknown tools or limit-reached cases.
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
TAVILY_API_KEY=                 # Powers gpt-researcher and chat web_search tool
FIRECRAWL_API_KEY=              # gpt-researcher

# Runtime flags (read in main.py lifespan)
FORESIGHT_EMBED_WORKER=true     # Default: embed the worker in the API process. Set false to run the worker separately.
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

## Worker Jobs

The worker handles discovery pipeline runs (fetching, triage, classification), deep research (gpt-researcher), executive brief generation, and workstream scans. Jobs time out after a configured duration and are marked failed. The worker imports from `app.deps`, `app.models.*`, `app.routers.*`, and `app.scheduler` — keep those import paths stable.

## Testing

Backend tests use pytest with async support. Frontend uses Vitest for unit tests and Playwright for E2E.

Test user credentials for local development:

- Email: `test@foresight.austintexas.gov`
- Password: `TestPassword123!`

## Deployment

- **Railway** runs two services: web (FastAPI + embedded worker by default) and an optional standalone worker. Auto-deploys on push to `main`. Health checks: `/api/v1/health` (web), `/api/v1/worker/health` (worker).
- **Vercel** auto-deploys the frontend from `main`. The Vercel project is `foresight-frontend` (not `foresight-app`).

## Code hygiene: fix-as-you-go

This codebase has no external contributors — only the maintainer and AI agents. There is no "someone else's code" to leave alone. Pre-existing lint warnings, dead imports, and small style issues compound if every agent ignores them, so the rule is: when you touch a file, leave it cleaner than you found it.

- **Touched-file rule.** If you edit a file and `ruff check` or `eslint` reports issues in it, fix the in-file issues as part of the same change. Don't open a separate PR for trivia in the file you're already editing.
- **Auto-fix what's safe.** `ruff check --fix` and `eslint --fix` for `F401` (unused imports), `F541` (f-strings without placeholders), unused `eslint-disable` directives, and similar mechanical fixes. Run them on the files you touched; don't blanket-apply across the repo in a feature PR.
- **Don't bypass.** Do not silence with `# noqa`, `eslint-disable`, `// @ts-ignore`, or `--no-verify` to make a check pass. If a rule genuinely doesn't fit, change the rule config in `pyproject.toml` / `eslint.config.js` and explain why in the commit. The codebase shouldn't accumulate per-line escape hatches.
- **Cleanup PRs are welcome.** When you notice a cluster of pre-existing issues outside the files you're touching (e.g., the `backend/scripts/` ruff backlog), open a separate small PR scoped to that cleanup rather than mixing it into a feature change. Document anything you deliberately leave alone (e.g. "intentional pattern to avoid re-render loop").
- **`react-hooks/exhaustive-deps` deserves judgment.** Some of these warnings are intentional — adding the dep would cause a re-render loop. When you keep one, leave a one-line comment explaining why; don't just add `// eslint-disable-next-line`.
