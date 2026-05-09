# Plan: LLM Audit & Reporting (5 phased PRs)

## Summary

Extend the existing `llm_usage_events` pipeline to capture redacted prompt and
response payloads, expose them through an admin audit tab, and ship FOIA-ready
export. Selectively port DLP and prompt-injection defenses from the sibling
`foresight-aci` project rather than rebuild them from scratch.

## Scope

- **In**: prompt/response payload capture, PII redaction, admin audit UI tab,
  conversation replay, CSV/PDF export, optional source-content injection filter.
- **Out**: per-user budgets, scheduled email/Slack digests, role-scoped audit
  views, chat thumbs-up/down. These are future PRs that key off the data
  pipeline this plan establishes.

## Foundation already in the codebase (do not rebuild)

- `backend/app/usage_telemetry.py` — `record_llm_usage_event` + per-request
  context bridge (user_id, run_id, task_id, card_id, workstream_id).
- Supabase table `llm_usage_events` (migration
  `supabase/migrations/20260507000003_pilot_usage_collaboration.sql`).
- `backend/app/openai_provider.py` already calls the recorder per call.
- `backend/app/routers/usage.py` already has `/admin/usage/summary` and
  `/admin/usage/recent` aggregate endpoints.

We extend this pipeline. We do **not** parallel-build a new `llm_call_log`
table or new provider wrapper.

## Source material to port from foresight-aci

- `~/Projects/amanda/foresight-aci/backend/app/middleware/dlp_support.py` —
  PII redaction primitives (PR 1).
- `~/Projects/amanda/foresight-aci/backend/app/middleware/dlp_persistence.py`
  — redacted-payload storage helpers (PR 1).
- `~/Projects/amanda/foresight-aci/backend/app/security/injection.py` (217
  lines) — prompt-injection input filter (PR 5).
- `~/Projects/amanda/foresight-aci/backend/app/middleware/audit.py` — request
  audit middleware patterns (reference only; we already have admin audit log).

## Phases

### PR 1 — Payload capture + DLP redaction

**Branch**: `feat/llm-audit-capture`

- Migration: extend `llm_usage_events` with
  - `prompt_excerpt TEXT` (≤ 4 KB, redacted)
  - `response_excerpt TEXT` (≤ 4 KB, redacted)
  - `tool_calls JSONB`
  - `redaction_flags JSONB` (which detectors fired)
  - `prompt_messages_full_ref TEXT` (nullable; future cold-storage URI)
  - Index on `(user_id, created_at DESC)` for filter queries.
- New module `backend/app/security/dlp.py` (port + adapt from aci
  `dlp_support.py`): redacts emails, phone, SSN-shaped, addresses; returns
  `(redacted_str, set_of_flags)`.
- Update `record_llm_usage_event` signature to accept optional `messages`,
  `response_text`, `tool_calls`. Redact, truncate to 4 KB, store.
- New `admin_settings` row: `FORESIGHT_AUDIT_LLM_CONTENT` (bool, default
  **false** in production). When false, capture is a no-op — only token/cost
  metrics persist (today's behavior).
- Tests:
  - `backend/tests/test_dlp.py` — redaction unit tests.
  - Extend `backend/tests/test_usage_telemetry.py` for capture-on / capture-off
    branches.
  - Integration: end-to-end chat round-trip writes a row with redacted excerpts.

### PR 2 — Audit read API

**Branch**: `feat/llm-audit-read-api`

- Extend `backend/app/routers/usage.py` (do **not** create a parallel
  router — the existing file already has the admin/usage namespace):
  - `GET /api/v1/admin/usage/events` — paginated list with filters
    `route` (operation), `user_id`, `model`, `from`, `to`, `min_cost`,
    `status`. Returns excerpts.
  - `GET /api/v1/admin/usage/events/{id}` — single event with full redacted
    content + `tool_calls` + `metadata`.
- Apply `@limiter.limit("60/minute")` on list, `@limiter.limit("120/minute")`
  on detail; gate behind admin RBAC (mirror `admin_discovery.py`).
- Tests: filter combos, pagination, RBAC denial path, redaction passthrough.

### PR 3 — Admin UI tab "LLM activity"

**Branch**: `feat/llm-audit-admin-ui`

- `frontend/foresight-frontend/src/lib/admin-api.ts` — add `listUsageEvents`
  and `getUsageEvent` clients.
- New tab in `AdminConsole.tsx` ("LLM activity"). If the file gets too dense,
  split the tab body into `components/admin/LlmAuditTab.tsx`.
- Filter bar (route, user, model, date range, status, min cost) + virtualized
  list (`@tanstack/react-virtual`) + slide-over detail drawer with copyable
  redacted prompt and response.
- Wire toggle for `FORESIGHT_AUDIT_LLM_CONTENT` into the existing settings
  tab pattern so admins can flip it without redeploying.
- Tests: Vitest unit for filter bar + drawer; one Playwright E2E
  (load → filter → open detail).

### PR 4 — Conversation replay + FOIA export

**Branch**: `feat/llm-audit-replay-export`

- Backend:
  - `GET /api/v1/admin/usage/conversations/{conversation_id}/replay` — joins
    `chat_messages` + `llm_usage_events` for the conversation, returns the
    full ordered timeline including retrieval scores from `rag_engine.py`
    metadata.
  - `POST /api/v1/admin/usage/export` — accepts filter payload, returns a
    signed-URL CSV (use Supabase storage). Optional PDF via existing
    `export_service.py`.
- Frontend: "Replay" tab inside the detail drawer; "Export" button in the
  tab header opens a modal (date range + filter snapshot + format pick).
- Tests: replay returns the correct join shape; export endpoint produces a
  valid CSV with redacted columns; auth-gated.

### PR 5 — Source-content injection filter (optional, parallel-able)

**Branch**: `feat/llm-audit-injection-filter`

- New `backend/app/security/injection.py` — port from
  `foresight-aci/backend/app/security/injection.py` (217 lines).
- Apply on fetched RSS / web content inside `discovery_service.py` before any
  LLM call (triage stage). On match → tag in `discovered_sources.metadata`
  and skip the LLM call for that item.
- New `safety_incidents` table + a minimal "Safety" mini-tab next to "LLM
  activity".
- Skip this PR if PR 1–4's captured logs show no real injection attempts in
  the wild — don't add infra speculatively.

## Per-phase workflow (the review cadence the user asked for)

For every PR above:

1. Implement on the named feature branch off latest `main`.
2. Run local checks before pushing: `ruff check`, `pytest`,
   `pnpm lint`, `npx tsc --noEmit`.
3. Open PR in **review-ready** state (not draft) with a summary + test plan.
   Base branch = `main`.
4. Wait ~10 min for CodeRabbit / Sourcery / Copilot review.
5. Spawn a **background** general-purpose agent (`run_in_background: true`)
   to (a) read every bot comment, (b) apply mechanical fixes on the same
   branch, (c) push, (d) merge once green. Main thread + other foreground
   agents move on to the next phase immediately — don't block on the merge.
6. After merge, sync local `main`, branch the next phase off it.

## Parallel execution

- PR 1 must merge before PR 2 (router needs the new columns).
- PR 2 must merge before PR 3 (UI consumes the read API).
- PR 4 backend can start in parallel with PR 3 frontend (separate agent,
  separate files); merge order: PR 3 then PR 4.
- PR 5 is independent of PR 2/3/4 and can be developed in parallel by a
  background agent any time after PR 1 merges.

Concretely: after PR 1 merges, dispatch one background agent on PR 5 while
the foreground works PR 2 → PR 3, with PR 4 backend opened by a second
background agent overlapping PR 3.

## Testing summary (one line per item)

- PR 1: redaction unit tests + capture flag branches + integration round-trip.
- PR 2: filter combinations + pagination + admin RBAC.
- PR 3: filter-bar Vitest + drawer Vitest + 1 Playwright E2E.
- PR 4: replay join shape + CSV export schema + auth gate.
- PR 5: injection-pattern unit tests + discovery-pipeline integration test.
