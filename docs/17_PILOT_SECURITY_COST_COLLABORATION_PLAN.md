# Pilot Security, Cost Controls, and Collaboration Plan

## Purpose

Foresight is moving toward pilot users. The immediate goal is a solid security
and cost-control posture for Vercel, Supabase, and the OpenAI-backed research
pipeline without overbuilding enterprise governance before usage patterns are
known.

This plan also prepares the codebase for a Phase 3 collaboration model where
workstreams can be shared by a group, rather than only copied or owned by one
user.

## Current Direction

Use a conservative pilot model now:

- Org workstreams are visible to all authenticated users.
- User workstreams are owned by one user.
- Paid or mutating actions require ownership or admin rights.
- Signals can be globally readable where the product already treats them as
  strategic intelligence, but workstream-specific state stays scoped to the
  workstream.

Move to true collaboration in Phase 3:

- Shared workstreams with members and roles.
- Shared board state, research history, briefs, comments, and portfolios.
- Optional private notes per user where needed.

## Phase 1: Pilot Security Baseline

Goals:

- Prevent authenticated pilot users from spending budget or mutating objects
  they only have read access to.
- Make admin-only operations explicit.
- Keep auth logic centralized so Phase 3 membership can be added cleanly.

Work:

- Add central authorization helpers:
  - `is_admin(user)`
  - `require_admin(user)`
  - `get_workstream_access(...)`
  - `require_workstream_access(...)`
  - `require_card_research_access(...)`
- Apply these helpers to:
  - research task creation
  - production/debug health endpoints that run live LLM checks
  - `/admin/*` mutation endpoints
- Add or verify production env controls:
  - `ENVIRONMENT=production`
  - strict `ALLOWED_ORIGINS`
  - `FORESIGHT_ENABLE_SCHEDULER=false` during early pilot unless explicitly needed
  - `FORESIGHT_DEMO_FREEZE=true` for demos
- Review all service-role-backed endpoints for missing ownership checks.

Acceptance:

- Non-admin users cannot call admin/debug LLM endpoints.
- Non-owner users cannot queue paid research against another user's workstream.
- Org workstream read access remains intact.
- Authorization decisions are routed through shared helpers where practical.

## Phase 2: Cost Benchmarking and Budget Controls

Goals:

- Measure actual token and external API spend by workflow.
- Prevent runaway research/discovery jobs.
- Prefer programmatic filtering, database search, RSS, and cached context before
  expensive LLM or agentic search work.

Work:

- Add `llm_usage_events`:
  - user_id
  - model
  - operation
  - prompt/input tokens
  - completion/output tokens
  - cached tokens when available
  - estimated cost
  - run/task/card/workstream identifiers
  - latency and error status
- Add `external_api_usage_events` for Tavily, Serper, Exa, Firecrawl, and GPT
  Researcher reported costs where available.
- Wrap OpenAI calls behind a usage-recording helper instead of manually tracking
  only some paths.
- Add a benchmark runner:
  - single card quick update
  - single card deep research
  - workstream scan
  - discovery run
  - executive brief generation
- Add budget guardrails:
  - per-task estimated max cost
  - daily per-user and global caps
  - kill switches for deep research and scheduled AI jobs
  - lower pilot defaults for discovery query/source caps

Acceptance:

- A single benchmark run produces a cost waterfall by stage and model.
- Deep research stops before a configured budget cap.
- Discovery defaults are pilot-safe unless explicitly overridden.
- Scheduled jobs cannot silently create unbounded cost.

## Phase 3: Workstream Collaboration

Goals:

- Support true group collaboration on shared workstreams.
- Avoid duplicated AI spend by reusing shared research, briefs, and portfolios.
- Preserve room for personal notes without confusing them with shared comments.

Data model:

- Add `workstream_members`:
  - `id`
  - `workstream_id`
  - `user_id`
  - `role`: `owner`, `editor`, `commenter`, `viewer`
  - `added_by`
  - `created_at`
  - `updated_at`
- Add unique constraint on `(workstream_id, user_id)`.
- Add indexes on `workstream_id`, `user_id`, and `(workstream_id, role)`.
- Keep `workstreams.owner_type` as `user` or `org` for now.

Authorization model:

- `owner`: manage workstream, members, board state, research, briefs, portfolios.
- `editor`: edit board state, run research, create briefs, create portfolios.
- `commenter`: read, comment, add shared observations, no board mutation.
- `viewer`: read only.
- `org` workstreams: read for all authenticated users, edits limited to admins
  or explicit future org editors.

Object behavior:

- `workstream_cards` are shared board state.
- Briefs are shared artifacts.
- Portfolios are shared by default inside a shared workstream.
- Comments are shared.
- Private notes should be separate from shared comments if needed.
- Existing `workstream_cards.notes` needs a migration decision:
  - migrate to shared comments, or
  - keep as legacy shared note field and add private notes separately.

Sharing workflow:

- Owner invites users by email or existing user account.
- Invite grants a role.
- User sees shared workstream in the Workstreams list.
- All members see the same board, briefs, comments, and portfolios according to
  role.
- Copy/branch can remain a secondary action for users who want their own
  derivative workstream.

Acceptance:

- Existing owner-only workstreams keep working.
- Shared members can access workstreams according to role.
- RLS and backend authorization agree.
- UI makes the access mode visible: Owner, Editor, Commenter, Viewer, Org.
- Audit fields capture who changed membership and major shared artifacts.

## Phase 3 Prep Embedded in Earlier Phases

Do now:

- Centralize auth checks in `app.authz`.
- Name capabilities as `read`, `edit`, and `manage` rather than hardcoding
  owner-only logic everywhere.
- Avoid adding new direct ownership checks when a helper can express intent.
- Keep paid actions behind `edit`-level capability.
- Keep org-readable behavior explicit and separate from editable behavior.

Avoid now:

- Adding ad hoc share tables that cannot become `workstream_members`.
- Treating copied workstreams as the primary collaboration model.
- Mixing shared comments and private notes in the same field without a migration
  plan.

## Immediate Implementation Started

- Added `backend/app/authz.py` with pilot rules and Phase 3 extension points.
- Research task creation now checks workstream edit access or card research
  access before queueing paid work.
- GPT Researcher debug endpoint is admin-only.
- Several `/admin/*` mutation endpoints now require admin role.
- Added `workstream_members` migration prep with owner/editor/commenter/viewer
  roles and wired the auth helper to honor those roles.
- Added `llm_usage_events` and `external_api_usage_events` migrations plus
  best-effort OpenAI telemetry around chat completions, responses, and
  embeddings.
- Added admin usage summary endpoints:
  - `/api/v1/admin/usage/summary`
  - `/api/v1/admin/usage/recent`
- Added pilot research kill switches and task cost caps:
  - `FORESIGHT_ENABLE_AI_RESEARCH`
  - `FORESIGHT_ENABLE_DEEP_RESEARCH`
  - `FORESIGHT_MAX_RESEARCH_TASK_ESTIMATED_COST_USD`
  - `RESEARCH_TASK_ESTIMATED_COST_<TASK_TYPE>_USD`
- Moved additional card intelligence reads/searches and taxonomy reads behind
  normal authenticated API access.
