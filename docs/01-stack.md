# 01 — Stack

What's installed, what version, and the choices you should keep matching.
Pin the live versions against `backend/requirements.txt` and
`frontend/foresight-frontend/package.json` if a number here looks stale.

## Backend

- Python 3.11 (Dockerfile pins `python:3.11-slim`)
- FastAPI ≥ 0.104 + Pydantic v2
- Uvicorn (dev) / Gunicorn + UvicornWorker (prod), 4 workers, 120s timeout
- supabase-py ≥ 2 (sync client — wrap in `asyncio.to_thread` from async paths)
- openai ≥ 1.3 (commercial API, not Azure — see [03-ai-pipeline.md](./03-ai-pipeline.md))
- gpt-researcher ≥ 0.9 (deep research, routed through Serper / SearXNG)
- APScheduler ≥ 3.10 (nightly + weekly jobs, see `app/scheduler.py`)
- httpx + aiohttp for outbound HTTP, feedparser for RSS, trafilatura + newspaper3k
  for article extraction
- slowapi for rate limiting (`app/security.py`)
- reportlab + python-pptx + matplotlib + pandas for PDF/PPTX/CSV exports
- pytest with `pytest-asyncio` for tests

## Frontend

- React 18.3, TypeScript 5.6, Vite 6
- TailwindCSS v3.4 + tailwindcss-animate (config in
  `frontend/foresight-frontend/tailwind.config.ts`)
- Radix UI primitives + shadcn/ui (`src/components/ui/`)
- React Router v6 (lazy-loaded routes in `src/App.tsx`)
- `@supabase/supabase-js` ^2.89
- `@tanstack/react-virtual` for `VirtualizedGrid` / `VirtualizedList`
- `@dnd-kit/core` + `@dnd-kit/sortable` for kanban drag
- `@xyflow/react` for relationship graphs
- `recharts` for charts, `lucide-react` for icons
- `react-hook-form` + `zod` for forms
- `react-markdown` + `remark-gfm` for streaming chat output
- `sonner` for toasts
- `next-themes` for dark mode
- Vitest + jsdom for unit tests, Playwright for E2E
- pnpm for installs

## Data + infra

- Supabase (Postgres + pgvector + Auth + RLS).
- pgvector embeddings are 1536-dim. Production embedding model is
  `text-embedding-3-small` (set via `OPENAI_EMBEDDING_MODEL`); the code
  default in `app/openai_provider.py` is `text-embedding-ada-002`. Both are
  1536-dim, so they coexist in the same column without re-embedding.
- SearXNG runs in Docker (`docker-compose.yml` + `searxng/`).
- Migrations: `supabase/migrations/<UTC-timestamp>_<description>.sql`. Apply
  with `npx supabase db push`.
- Hosting: Vercel for the frontend, Railway for the API + worker, both auto-
  deploying from `main`. See [07-deployment.md](./07-deployment.md).

## Retired / banned

These show up in old code comments or PR threads. Don't reintroduce them.

| Thing                           | Status                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Azure OpenAI                    | Migrated off. Symbols named `azure_*` are kept only for caller compatibility — they hit the commercial API now. |
| GPT-5.5                         | Retired. Don't route to it. Production runs gpt-5.4 / gpt-5.4-mini.                                             |
| GPT-4.1                         | Stale references in docstrings only — current model is gpt-5.4.                                                 |
| Tavily                          | Decommissioned. `TAVILY_API_KEY` is off; no code path may call it.                                              |
| Firecrawl                       | Decommissioned. Same as Tavily.                                                                                 |
| Neo4j / graph DB                | Never adopted. Relational schema does the job.                                                                  |
| HuggingFace Spaces              | Old deploy target. Production is Railway + Vercel.                                                              |
| The 11K-line `main.py` monolith | Broken up into 37 routers + 33 model modules. Don't add endpoints to `main.py`.                                 |

## CLIs available on the maintainer machine

Already installed and authenticated — prefer running these yourself rather
than asking the user:

- `npx supabase` — migrations, DB SQL
- `vercel` — deployments + env vars (project `foresight-frontend`)
- `gh` — PRs, issues, CI
- `railway` may or may not be present; verify before assuming
