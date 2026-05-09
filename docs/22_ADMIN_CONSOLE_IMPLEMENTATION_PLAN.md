# Administrative Console Implementation Plan

**Status:** First implementation branch  
**Date:** 2026-05-08  
**Branch:** `feat/admin-console`

## Purpose

Foresight needs a single administrative suite for pilot operations: user administration, model and chat configuration, system update controls, job visibility, usage telemetry, and operational health. The app already has several admin-only backend primitives, but they are scattered across routers and not exposed as a coherent UI.

This branch builds the first complete admin console at `/admin`.

## Existing Admin Primitives

- `backend/app/routers/admin.py`
  - guest account review and account-type updates
  - manual scan trigger
  - quality recalculation
  - domain reputation management
  - velocity calculation trigger
  - lens classification backfill trigger
- `backend/app/routers/usage.py`
  - admin usage summary
  - recent LLM events
- `backend/app/routers/health.py`
  - admin GPT Researcher/debug config
- `backend/app/authz.py`
  - `require_admin()` based on `users.role in {"admin", "service_role"}`

## Console Information Architecture

### 1. Overview

Purpose: give admins a fast health/readiness scan.

Metrics:
- users by account type
- cards/signals by status
- workstreams total and org-owned count
- queued/running/failed research tasks
- recent discovery runs and workstream scans
- feature flag/runtime status

### 2. Users

Purpose: administer pilot access.

Features:
- list users with search and account-type/role filters
- edit `role` and `account_type`
- view last-updated/created timestamps
- summarize guest/paid/admin counts

### 3. Operations

Purpose: control expensive or background update jobs.

Actions:
- trigger manual card update scan
- trigger velocity recalculation
- trigger quality recalculation
- trigger lens classification backfill

Visibility:
- recent research tasks
- recent discovery runs
- recent workstream scans
- status chips and error preview

### 4. Models & Chat

Purpose: centralize model, chat quota, research, and feature settings.

Settings are stored in a new `admin_settings` table. Values are grouped and typed so the UI can render appropriate inputs. For this first pass, settings are a persisted control plane with process-local effective values surfaced from environment defaults plus database overrides. Follow-on branches can wire every service to read these settings dynamically where runtime reload is required.

Settings groups:
- Models: chat, agent, mini, embedding model, reasoning effort
- Chat: quota enabled, daily sessions, turns per session
- Research: AI research enabled, deep research enabled, max estimated task cost
- Runtime flags: scheduler, embedded worker, demo freeze, public share/collaboration/realtime/guest flags

### 5. Usage

Purpose: make cost and model/API consumption visible.

Features:
- usage window selector
- LLM totals
- external API totals
- breakdown by model
- breakdown by operation/provider
- recent LLM events

## Backend Additions

New or expanded endpoints:

- `GET /api/v1/admin/overview`
- `GET /api/v1/admin/users`
- `PATCH /api/v1/admin/users/{user_id}`
- `GET /api/v1/admin/settings`
- `PATCH /api/v1/admin/settings/{key}`
- `GET /api/v1/admin/jobs/recent`

New table:

```sql
CREATE TABLE admin_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('string', 'number', 'boolean', 'json')),
  group_name TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

RLS:
- authenticated admins can read/write through API only
- service role retains operational access

## Frontend Additions

- `src/lib/admin-api.ts`
- `src/pages/AdminConsole.tsx`
- `/admin` route in `App.tsx`
- admin-only header entry when `profile.role === "admin" || "service_role"`

Design principles:
- dense operational console, not a marketing page
- tabs for primary sections
- tables and compact metric cards for repeat use
- restrained styling consistent with existing dashboard/admin surfaces
- all dangerous/expensive operations require an explicit button click and show result/error feedback

## Validation

Run:

```bash
cd backend && python -m py_compile app/routers/admin.py
cd frontend/foresight-frontend && npx tsc --noEmit
cd frontend/foresight-frontend && npm run build
```

`ruff check` should be run where available.

## Follow-On Work

- Wire core services to consume `admin_settings` dynamically for settings that must take effect without restart.
- Add audit logging for every admin setting and user mutation.
- Add pagination to recent job tables if pilot volume grows.
- Add role-protected UI tests for `/admin`.
- Add usage budgets and alert thresholds.
