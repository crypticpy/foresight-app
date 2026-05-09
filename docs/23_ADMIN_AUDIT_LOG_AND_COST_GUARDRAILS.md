# Admin Console — Next Two Items

**Date:** 2026-05-08
**Branch base:** `main` at `6cb5498` (admin console PR 30 just merged)
**Status:** Plan-only, not started.

## Context (so future-me doesn't have to dig)

Foresight just shipped the admin console (PR 30, squashed into `main`). It
ships an `/admin` page with five tabs (Overview, Users, Operations, Models &
Chat, Usage), a typed admin API client, an `admin_settings` table, and
`PATCH /admin/users/{id}` + `PATCH /admin/settings/{key}` endpoints.

Two follow-up items the user agreed to next:

1. **Audit log** — record every admin user/setting mutation.
2. **Cost guardrails** — turn the read-only Usage tab into something that
   can stop runaway spend.

These are independent and should ship as **two separate PRs**.

---

## Item 1 — Admin audit log

### Why

Right now `PATCH /admin/users/{id}` and `PATCH /admin/settings/{key}` write
the new value with no record of _who changed what, when, from what_. For a
city pilot with multiple admins, this is governance baseline. Cheap to add.

### Schema

New migration: `supabase/migrations/<ts>_admin_audit_log.sql`.

```sql
CREATE TABLE public.admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_email TEXT,                 -- denormalized at write time, survives user delete
    action TEXT NOT NULL,             -- e.g. 'admin.user.update', 'admin.setting.update'
    target_type TEXT NOT NULL,        -- 'user' | 'setting'
    target_id TEXT NOT NULL,          -- user_id or setting key
    before JSONB,                     -- previous state (subset of fields, not full row)
    after JSONB,                      -- new state
    request_ip TEXT,                  -- pulled from FastAPI Request, optional
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_audit_log_target
    ON public.admin_audit_log (target_type, target_id, created_at DESC);
CREATE INDEX idx_admin_audit_log_actor
    ON public.admin_audit_log (actor_id, created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_audit_log_service_role
    ON public.admin_audit_log FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
```

### Backend changes

- New helper in `backend/app/routers/admin.py` (or a new
  `backend/app/admin_audit.py` if it grows):

  ```python
  def log_admin_action(
      actor: dict,
      action: str,
      target_type: str,
      target_id: str,
      before: dict | None,
      after: dict | None,
      request: Request | None = None,
  ) -> None:
      try:
          supabase.table("admin_audit_log").insert({
              "actor_id": actor["id"],
              "actor_email": actor.get("email"),
              "action": action,
              "target_type": target_type,
              "target_id": target_id,
              "before": before,
              "after": after,
              "request_ip": request.client.host if request else None,
          }).execute()
      except Exception:
          # Audit failures must not block the underlying mutation, but
          # they must be visible in logs.
          logger.exception("Failed to write admin audit log entry")
  ```

  Wrap the insert in `asyncio.to_thread` from the caller (the supabase
  client is sync). Don't raise — the user mutation already succeeded; a
  failed audit row is a logging problem, not an HTTP error.

- Wire it into:
  - `update_admin_user` (admin.py around line 405) — log
    `action="admin.user.update"`, `before` = the row we read first,
    `after` = the patch.
  - `update_admin_setting` (admin.py around line 470) — log
    `action="admin.setting.update"`, `before` = `{"value": prev_value}`,
    `after` = `{"value": new_value}`.

  Both endpoints currently do a single `update`/`upsert` in one shot.
  We'll need to read-before-write so `before` isn't empty. Cheap because
  it's keyed lookup.

- New endpoint: `GET /api/v1/admin/audit?limit=&offset=&target_type=&actor_id=&since=`
  Returns the audit rows joined with the user table for actor display
  name. Rate-limit it modestly (`@limiter.limit("60/minute")`).

### Frontend changes

- Add `fetchAdminAuditLog` to `frontend/foresight-frontend/src/lib/admin-api.ts`.
- Add a sixth tab to `AdminConsole.tsx`: "Audit log".
  - Columns: Time · Actor · Action · Target · Diff (collapsed JSON).
  - Default filter: last 7 days. Filters: actor, action, target_type.
  - Use the same `AdminListTable`-style block as the Operations tab.

### Tests

- Backend: pytest test that `update_admin_user` writes an audit row with
  the right `before`/`after`.
- Frontend: skip; the read endpoint is straightforward.

### Out of scope for this PR

- Slack/email alerts on suspicious actions.
- Retention / archival policy. (Pilot volume is too low to matter yet.)
- Audit for non-admin endpoints. (Only `admin.*` for now.)

---

## Item 2 — Cost guardrails

### Why

`FORESIGHT_MAX_RESEARCH_TASK_ESTIMATED_COST_USD` already exists, but the
Usage tab is purely retrospective — nothing stops the system if costs
spike. Daniel cleared the P-card; we owe him real-time guardrails so a
runaway loop doesn't burn the budget overnight.

### Behavior

Two-layer model:

1. **Hard cap** — when reached, the worker refuses to start new
   research tasks / discovery runs / signal_agent invocations until
   reset. Returns 503 with a clear message; existing in-flight work is
   not killed.
2. **Soft alert** — when reached, log a warning + write an
   `admin_audit_log` row of type `cost.alert`. (Alerts via email / Slack
   are out of scope for this PR — we just record it; UI can subscribe.)

Window: rolling **N days** (default 7) summed from
`usage_telemetry` LLM events + external API events. Reuse the same query
the Usage tab already runs.

### New admin settings (additions to `SETTING_DEFINITIONS` in admin.py)

| key                                  | group    | type    | default | meaning                  |
| ------------------------------------ | -------- | ------- | ------- | ------------------------ |
| `FORESIGHT_COST_BUDGET_USD`          | research | number  | null    | hard cap, rolling window |
| `FORESIGHT_COST_BUDGET_WINDOW_DAYS`  | research | number  | 7       | window length            |
| `FORESIGHT_COST_ALERT_THRESHOLD_USD` | research | number  | null    | soft alert               |
| `FORESIGHT_COST_GUARDRAIL_ENABLED`   | research | boolean | false   | master switch            |

Null = "no cap / no alert", honoring the nullable `admin_settings.value`
already in place.

### Backend gate

New module: `backend/app/cost_guardrail.py`.

```python
async def check_budget_or_raise() -> None:
    """Raise HTTPException(503) if the rolling-window spend exceeds the
    configured hard cap.

    Caches the most recent budget check for ~30s to avoid querying
    usage_telemetry on every request. Reads admin_settings live so a
    save in the console takes effect immediately.
    """
```

Call sites (the expensive paths only):

- `routers/research.py` — start of `create_research_task`
- `routers/discovery.py` — start of `trigger_discovery_run`
- `signal_agent_service._execute_create_signal` — beginning of agent loop
- `chat_service` — only for the deep-research tool, not for normal chat

Skip cheap paths (chat replies, embedding) — gating chat replies makes
the app feel broken without saving real money.

### Frontend changes

- New "Cost guardrails" panel inside the Usage tab (or a new "Budget" tab
  if it gets too big).
  - Show: window spend, configured cap, configured alert threshold,
    progress bar, "guardrail tripped" red banner if active.
  - Edit cap / threshold / window inline (uses existing
    `updateAdminSetting`).
  - "Reset guardrail" button that just clears a `system_state` row —
    needs a small POST endpoint, e.g. `POST /api/v1/admin/cost/reset`.
- Show an in-app banner site-wide for non-admins when guardrail is
  tripped: "Research is temporarily paused; an administrator will
  re-enable it." (Use existing toast/banner primitives.)

### Tests

- Backend: pytest that
  `check_budget_or_raise` raises 503 when summed cost > cap, otherwise
  returns. Mock the supabase telemetry query.
- Backend: integration test that `create_research_task` returns 503
  when guardrail enabled and budget exceeded.

### Out of scope for this PR

- Per-user budgets.
- Budgets scoped by org / department.
- Email/Slack alerts.

---

## Suggested sequencing on the other side of compact

1. Start a fresh branch `feat/admin-audit-log`.
2. Write the migration + the helper + wire the two endpoints + add the
   GET endpoint + the frontend tab.
3. Open PR, get the bot reviews, fix, merge.
4. Branch `feat/admin-cost-guardrails` off updated main.
5. Add the four settings, the guardrail module, the call sites, the UI
   panel.
6. Open PR, review, merge.

Both PRs should be small enough (~300 LOC each) that bot review feedback
will be a single fixup commit.

---

## Notes the future-session-me should know

- **The admin console layout convention** is established: each tab is a
  function inside `AdminConsole.tsx`. Don't refactor that into per-file
  components without asking — the user accepted the monolithic file
  during PR 30 review (Sourcery suggested splitting; we kept it).
- **Settings reload pattern**: only `OPENAI_*` settings have an
  in-process reload hook (`reload_openai_config()`). The cost guardrail
  module should read `admin_settings` live (not from env) so that
  doesn't become another "the UI lies" bug.
- **The `admin_settings.value` column is nullable**. Null means "fall
  back to env / default". `list_admin_settings` already handles this —
  don't break that contract.
- **Rate-limit convention**: `@limiter.limit("N/minute")` immediately
  below `@router.<verb>(...)`, with `request: Request` as the first
  arg of the handler. Both new endpoints we add (audit GET, cost reset
  POST) should follow this.
- **`_user_profile_cache` is single-process today** — documented as a
  scope limitation in `evict_cached_profile`. Don't try to make audit
  log entries depend on cross-worker invalidation.
- **Don't add `# noqa` / `eslint-disable` to make checks pass** — the
  project rule is: fix the underlying issue or change the rule
  config and explain why.
