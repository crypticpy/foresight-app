# 02 — Architecture

Two services, one DB, one scheduler, one worker. SPA frontend talks to the
API; the API and a separate worker process share Supabase as the truth store.

## Topology

```
                ┌─────────────────────┐
   Browser ───► │ Vercel (foresight-  │
                │  frontend, SPA)     │
                └──────────┬──────────┘
                           │ HTTPS, /api/v1/* with Bearer JWT
                           ▼
                ┌─────────────────────┐        APScheduler (nightly/weekly)
                │ Railway: API        │ ◄──────  app/scheduler.py
                │  FastAPI (gunicorn  │
                │  + UvicornWorker)   │
                │  Embedded worker?   │ ──── FORESIGHT_EMBED_WORKER
                └──────┬──────────────┘
                       │             ▲
                       ▼             │ job_events table (status, progress)
                ┌─────────────────────┐
                │ Railway: Worker     │   ForesightWorker poll loop
                │  app/worker.py      │   (briefs, discovery, scans)
                └──────┬──────────────┘
                       ▼
   ┌──────────────────────────────────────────────────────┐
   │ Supabase (Postgres + pgvector + Auth)                │
   │  cards, sources, workstreams, portfolios,            │
   │  job_events, chat_*, usage_telemetry, audit_*, ...   │
   └──────────────────────────────────────────────────────┘
                       ▲
   ┌───────────────────┴───────────────────┐
   │ OpenAI (commercial), Serper, SearXNG  │
   └───────────────────────────────────────┘
```

`FORESIGHT_EMBED_WORKER=true` runs the worker inside the API process
(default for local dev). Production sets it to `false` on the API service
and runs a dedicated worker service. See [07-deployment.md](./07-deployment.md).

## Backend layout (`backend/app/`)

- `main.py` (~230 lines) — app factory: CORS, security middleware, lifespan
  (boots scheduler + embedded worker if flagged), router registration. To
  wire a new endpoint, add a router under `routers/` and register it here.
- `routers/` — 37 files, one per feature surface. All endpoints sit under
  `/api/v1`; user-scoped routes live under `/api/v1/me/...`. See
  [05-api-conventions.md](./05-api-conventions.md).
- `models/` — 33 Pydantic request/response modules. New models must be added
  to the file and re-exported from `models/__init__.py`.
- `deps.py` — singletons: `supabase`, `openai_client`, `get_current_user`
  (verifies the JWT, has a 5-min profile cache wrapped in `asyncio.to_thread`).
- `security.py` — `RateLimitMiddleware`, security headers, request-size cap.
  Sensitive endpoints decorate with `@rate_limit_*`.
- `scheduler.py` — APScheduler nightly/weekly cron jobs. Only runs when
  `FORESIGHT_ENABLE_SCHEDULER=true`.
- `worker.py` — `ForesightWorker` polls Supabase for `JOB_BRIEF`,
  `JOB_DISCOVERY`, `JOB_SCAN`. Status flows through `job_events`.
- `source_fetchers/` — RSS, NewsAPI, academic, government, tech-blog,
  SearXNG, Serper.
- Domain services (~60 modules at the package root): `discovery_service`,
  `signal_agent_service`, `research_service`, `brief_service`, `chat_service`,
  `rag_engine`, `lens_classification_service`, `pattern_detection_service`,
  `gamma_service`, `export_service`, `portfolio_export`, `openai_provider`,
  `quality_service`, `domain_reputation_service`, `entity_*`, `dedup*`,
  `cost_guardrail`, etc.

## Request lifecycle (typical)

1. Browser sends `Bearer <supabase JWT>` to `/api/v1/...`.
2. `RateLimitMiddleware` + size cap (in `security.py`) admit or 429.
3. The route's `Depends(get_current_user)` validates the JWT against Supabase
   (cached for 5 min) and returns the user dict.
4. Authz patterns (see `app/authz.py` and the org-vs-user pattern in
   [05-api-conventions.md](./05-api-conventions.md)) filter or 404.
5. The route calls a domain service. Supabase reads/writes go through the
   service-role client. Async paths wrap blocking Supabase calls with
   `asyncio.to_thread(...)`.
6. Long-running work (discovery, deep research, briefs, scans) does **not**
   block the request — it inserts a job row and emits the work to the worker
   via `job_events`.

## Worker job lifecycle

`app/worker.py` polls Supabase for queued jobs of these kinds:

- `JOB_DISCOVERY` — runs the discovery pipeline (fetch → triage → enrich →
  signal_agent → card creation).
- `JOB_BRIEF` — generates an executive brief (or portfolio brief).
- `JOB_SCAN` — runs a workstream scan.

For each job, the worker opens an `emit(JOB_KIND, id)` context manager
(`app/job_events.py`) that writes structured `started`, `progress`,
`completed`, `failed` events to the `job_events` table. UI status endpoints
read from `job_events` — do not scrape logs for job state.

Rules learned the hard way (see PRs #58, #61, #62):

- **Heartbeats off the loop.** Wrap the Supabase insert in
  `asyncio.to_thread(...)` or it will skip and trip the "no heartbeat"
  failure path.
- **No race-condition flips.** Terminal status writes (`completed`/`failed`)
  must check current status before overwriting, or a late heartbeat reverts
  a failed job to running.
- **Direct invocation needs a timeout.** Scripts that call discovery or
  signal_agent outside the worker must wrap in
  `asyncio.wait_for(..., timeout=1800)`. Anything tighter cuts signal_agent
  off mid-card-creation.

## Scheduler jobs (`app/scheduler.py`)

- 5:30 UTC — nightly domain reputation aggregation
- 6:00 UTC — nightly content scan (re-fetches active card sources)
- 6:30 UTC — nightly SQI (source quality) recalculation
- Nightly pattern detection + velocity calculation
- 8:00 UTC daily — digest job (checks weekly subscriptions)
- Weekly — workstream-clone fan-out + automated discovery sweep

`FORESIGHT_DEMO_FREEZE=true` suppresses all scheduler + embedded-worker auto-
fires (user-initiated jobs still run). Production has this set true while in
demo-only mode to keep API spend at zero.

## Frontend (SPA)

- Built with Vite, served as static assets from Vercel.
- `App.tsx` lazy-loads every page route and guards them with
  `RequireAuth`. See [06-frontend-patterns.md](./06-frontend-patterns.md).
- All API calls funnel through `lib/<feature>-api.ts` clients that wrap a
  shared `apiRequest<T>(endpoint, token, options)` helper.

## Why this shape

- The split worker keeps long LLM calls and gpt-researcher off the API event
  loop. Earlier we tried embedding everything in gunicorn; the 120s silence
  timeout would SIGTERM workers pinned by deep-research tasks. See PR #62.
- All status is in Supabase (`job_events`), not in-memory or in logs, so the
  embedded-worker and standalone-worker topologies look identical to the UI.
- 37 small routers + 60 services keep blast radius small per PR. The
  monolithic `main.py` history is in PR #20-ish range if you ever need it.
