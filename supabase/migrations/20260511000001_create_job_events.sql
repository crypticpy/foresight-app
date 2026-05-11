-- Generalized event log for long-running worker jobs.
--
-- Replaces the per-job result_summary.heartbeat_at + threaded-heartbeat
-- pattern (see PR #61 post-mortem) with an append-only timeline that any
-- worker stage can write to. The watchdog reads max(created_at) per job
-- to determine liveness; the frontend reads recent rows to render
-- progress.

create table if not exists public.job_events (
  id          uuid primary key default gen_random_uuid(),
  job_type    text not null,
  job_id      uuid not null,
  event_type  text not null,
  stage       text,
  message     text,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists job_events_job_idx
  on public.job_events (job_id, created_at desc);
create index if not exists job_events_type_time_idx
  on public.job_events (job_type, created_at desc);

alter table public.job_events enable row level security;

-- Service-role only. Worker writes via service key; API read paths are
-- brokered through endpoints with their own authz so a job timeline
-- never leaks across user boundaries.
create policy "service_role_full_access"
  on public.job_events
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.job_events is
  'Structured event log for worker jobs (research/brief/discovery/scan/signal_agent). Watchdog liveness source of truth.';
