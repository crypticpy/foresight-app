# 07 — Deployment

Where this thing runs, what env vars it needs, how to check it's alive.

## Topology recap

| Surface      | Host                         | Project / service           | Builds from                           |
| ------------ | ---------------------------- | --------------------------- | ------------------------------------- |
| Frontend SPA | Vercel                       | `foresight-frontend`        | `main`, auto                          |
| API          | Railway                      | `foresight-api` (web)       | `main`, auto                          |
| Worker       | Railway                      | `foresight-worker` (worker) | `main`, auto                          |
| DB + Auth    | Supabase                     | Foresight project           | migrations via `npx supabase db push` |
| SearXNG      | Self-hosted (docker-compose) | —                           | `docker-compose.yml`                  |

The Vercel project name is `foresight-frontend`, **not** `foresight-app`.

Both Railway services run from the same `backend/Dockerfile` and switch
behavior via `FORESIGHT_PROCESS_TYPE` (`web` | `worker`), set in
`backend/entrypoint.sh`.

## Backend container

`backend/Dockerfile`:

- `python:3.11-slim`, non-root `appuser` (uid 1000), writes nothing.
- Installs deps from `backend/requirements.txt`.
- Copies `backend/app/` and `branding/` (logos for PDF exports).
- `entrypoint.sh` routes to `gunicorn app.main:app ...` (4 workers,
  UvicornWorker, 120s timeout, 30s graceful) or `python -m app.worker`.
- Healthcheck `curl -f http://localhost:${PORT:-8000}/api/v1/health`.

The 120s gunicorn timeout is why long LLM work runs in the worker, not the
API. Embedding the worker in the API process used to SIGTERM workers pinned
by deep-research tasks. See [02-architecture.md](./02-architecture.md).

## Backend env vars

Production reads these from Railway. Local dev reads from `backend/.env`
(gitignored).

```env
# Supabase
SUPABASE_URL=
SUPABASE_KEY=
SUPABASE_SERVICE_KEY=

# OpenAI (commercial, not Azure)
OPENAI_API_KEY=
# Model overrides (defaults in app/openai_provider.py)
OPENAI_CHAT_MODEL=gpt-5.4-2026-03-05
OPENAI_CHAT_AGENT_MODEL=gpt-5.4-2026-03-05
OPENAI_CHAT_MINI_MODEL=gpt-5.4-mini-2026-03-17
OPENAI_EMBEDDING_MODEL=text-embedding-3-small   # prod override (code default is ada-002)
# OPENAI_REASONING_EFFORT=medium

# Search providers (Serper + SearXNG only; Tavily/Firecrawl banned)
SERPER_API_KEY=
SEARXNG_URL=

# Process behavior
FORESIGHT_PROCESS_TYPE=web        # or "worker" on the worker service
FORESIGHT_EMBED_WORKER=false      # prod: false on API when worker service exists
FORESIGHT_ENABLE_SCHEDULER=true   # prod: true on API service
FORESIGHT_DEMO_FREEZE=true        # set to true to suppress scheduler + embedded-worker auto-fires; user-initiated jobs still run

# Environment
ENVIRONMENT=production
ALLOWED_ORIGINS=https://foresight-app-nu.vercel.app,https://foresight-frontend.vercel.app
# CORS validator rejects non-HTTPS / localhost when ENVIRONMENT=production
```

**Banned**: do not set `TAVILY_API_KEY` or `FIRECRAWL_API_KEY`. Those code
paths are removed.

## Frontend env vars

Production reads these from Vercel. Local dev reads from
`frontend/foresight-frontend/.env`.

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=https://<railway-api-host>     # local: http://localhost:8000
```

## Health checks

- API: `GET /api/v1/health`
- Worker: `GET /api/v1/worker/health` (the standalone worker also serves a
  small health surface — used by the Railway healthcheck and the embedded-
  worker-vs-standalone distinction)

If `worker/health` 503s, look at `job_events` for the most recent failed
entries before reading logs.

## Deploy mechanics

- **Vercel** auto-deploys on every push to `main`. PRs get preview URLs.
  Build command and output dir are configured in the Vercel project; the
  repo's only relevant file is `vercel.json` (if present) and the build
  script in `frontend/foresight-frontend/package.json`.
- **Railway** auto-deploys on push to `main`. Two services share the same
  Dockerfile; they differ only by env vars (`FORESIGHT_PROCESS_TYPE`,
  `FORESIGHT_EMBED_WORKER`, `FORESIGHT_ENABLE_SCHEDULER`).
- **Supabase migrations** are not auto-applied. Whenever a PR adds a SQL
  file under `supabase/migrations/`, run `npx supabase db push` against
  the remote. Don't leave migrations sitting unapplied.

## CLIs you can use directly

These are installed and authenticated on the maintainer machine — run them
yourself rather than asking the user:

- `npx supabase db push` — apply pending migrations
- `vercel env ls` / `vercel env pull` — manage frontend env
- `gh pr list`, `gh pr view`, `gh pr checks` — PR + CI status
- `railway` may or may not be present; verify before assuming

For sandbox-blocked secrets, write the value into a temp file and read it
into Bash via `$(cat /tmp/foo)` rather than echoing it directly.

## Local dev

Backend:

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# Embedded worker runs by default (FORESIGHT_EMBED_WORKER=true). Set false
# and run `python -m app.worker` separately to mirror production topology.
```

Frontend:

```bash
cd frontend/foresight-frontend
pnpm dev             # port 5173
pnpm build           # production build
pnpm lint
npx tsc -b --noEmit  # type-check (must use -b)
pnpm test:run        # vitest one-shot
pnpm test:e2e        # playwright
```

SearXNG:

```bash
docker compose up searxng   # used by chat web_search + gpt-researcher
```

## Production smoke after a deploy

1. `gh pr checks <N>` shows green CI on the merged PR.
2. Vercel + Railway deploys show success in their dashboards.
3. `curl https://<api-host>/api/v1/health` returns 200.
4. `curl https://<api-host>/api/v1/worker/health` returns 200.
5. Open the frontend, log in, load Discover, run an Ask Foresight chat with
   one `@card` mention to exercise auth + RAG + chat + citations.

## Things production has bitten us on

- **`cost_usd` vs `estimated_cost_usd`**: writing the wrong column name
  silently returns `$0` and breaks cost dashboards. Use the right one in
  `app/usage_telemetry.py`.
- **Heartbeats inline in blocking calls** skip and trip the "no heartbeat"
  failure path. Wrap in `asyncio.to_thread`.
- **Status flips**: a late heartbeat reverting `failed` → `running` was
  a real bug (PR #61). Terminal status writes must check current state.
- **Missing migration push**: PRs that add SQL but never `db push` end up
  with code expecting columns that don't exist in prod.
- **CORS rejection on a new preview domain**: if you add a Vercel preview
  alias, you'll need to extend `ALLOWED_ORIGINS` (or it'll fail with a
  CORS error, not an auth error).
- **Embedded worker on prod**: must be `false` on the API service when the
  worker service exists, or you'll double-process jobs.
