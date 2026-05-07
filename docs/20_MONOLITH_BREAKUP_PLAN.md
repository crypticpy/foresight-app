# Monolith Breakup Plan

Date: 2026-05-07

## Goal

Reduce the highest-risk backend and frontend monoliths without changing product behavior. The work should make the system easier to review, test, and evolve for pilot users, especially around research cost control, exports, workstreams, and collaboration.

## Working Agreement

All work after this plan should follow this flow:

1. Create a branch from `main` using `codex/<scope>`.
2. Keep each branch focused on one refactor slice or one feature slice.
3. Open a draft PR early when the branch has meaningful shape.
4. Run the relevant local checks before requesting review.
5. Wait for code review and CI feedback before merging.
6. Address review comments in the PR branch.
7. Merge only after checks are green and reviews are resolved.

No direct pushes to `main` for implementation work.

## Current Hotspots

Backend:

| Area | Current Size | Risk |
| --- | ---: | --- |
| `backend/app/export_service.py` | ~5,958 lines | Export behavior, charts, PPTX/PDF generation, duplicated local imports, hard-to-review fixes |
| `backend/app/discovery_service.py` | ~3,867 lines | High-cost discovery workflow, deduplication, fetch orchestration, AI triage, persistence mixed together |
| `backend/app/research_service.py` | ~2,146 lines | Heaviest token path, gpt-researcher integration, source processing, report synthesis |
| `backend/app/routers/analytics.py` | ~1,692 lines | Large router with query assembly and response shaping mixed into endpoint handlers |
| `backend/app/workstream_scan_service.py` | ~1,333 lines | Workstream-specific discovery logic overlaps with broad discovery |
| `backend/app/routers/workstream_kanban.py` | ~951 lines | Permissions, card mutations, sharing, research status, bulk actions |

Frontend:

| Area | Current Size | Risk |
| --- | ---: | --- |
| `frontend/foresight-frontend/src/pages/WorkstreamKanban.tsx` | ~2,217 lines | Board state, filtering, collaboration, exports, research, modals in one component |
| `frontend/foresight-frontend/src/pages/DiscoveryQueue.tsx` | ~1,913 lines | Queue data loading, state transitions, filters, presentation in one page |
| `frontend/foresight-frontend/src/pages/GuideWorkstreams.tsx` | ~1,988 lines | Large static page, bundle weight |
| `frontend/foresight-frontend/src/components/kanban/CardActions.tsx` | ~976 lines | Per-card commands, export/research/share behavior, modal state |

## Refactor Principles

- Preserve external API behavior unless a PR explicitly declares a behavior change.
- Extract pure formatting, mapping, parsing, and chart helpers before moving orchestration.
- Add characterization tests before touching high-value behavior.
- Avoid broad renames and whitespace churn in implementation PRs.
- Keep write scopes disjoint where possible so review stays clear.
- Prefer new service modules under `backend/app/services` or feature-specific packages, then update imports gradually.
- For frontend, prefer extracting hooks and small presentational components before changing page routing or data models.

## PR Sequence

### PR 1: Quality Gate Baseline

Purpose: make future refactors easier to trust.

Scope:

- Add or update CI commands for backend import smoke test, Ruff, backend tests, frontend type-check, frontend build.
- Decide whether ESLint warnings remain non-blocking or are turned into a tracked warning budget.
- Add a short `docs/QUALITY_BASELINE.md` with the current warning categories.

Checks:

- `cd backend && venv/bin/python -m pytest`
- `cd backend && venv/bin/ruff check app tests`
- `cd frontend/foresight-frontend && npx tsc --noEmit`
- `cd frontend/foresight-frontend && pnpm build`

### PR 2: Export Service Split

Purpose: reduce the largest backend module with the least domain risk.

Target shape:

- `backend/app/export/markdown_pdf.py`
- `backend/app/export/charts.py`
- `backend/app/export/pptx_builder.py`
- `backend/app/export/pdf_builder.py`
- `backend/app/export/csv_builder.py`
- `backend/app/export/service.py`

Approach:

- Move pure chart generation first.
- Move markdown-to-PDF parsing next.
- Move PPTX/PDF builders behind the existing `ExportService` facade.
- Keep router imports stable until the final step.

Tests:

- Add unit tests for markdown parsing edge cases.
- Add smoke tests for chart generation returning a file path.
- Preserve existing export endpoint behavior.

### PR 3: Discovery Pipeline Boundaries

Purpose: make cost-heavy discovery code observable and testable.

Target shape:

- `backend/app/discovery/config.py`
- `backend/app/discovery/fetch_pipeline.py`
- `backend/app/discovery/deduplication.py`
- `backend/app/discovery/triage.py`
- `backend/app/discovery/persistence.py`
- `backend/app/discovery/service.py`

Approach:

- Extract configuration/default calculations.
- Extract source fetch orchestration from AI triage.
- Extract vector deduplication and Python fallback into a dedicated module.
- Add telemetry checkpoints around fetch count, source count, LLM calls, token usage, and persisted cards.

Tests:

- Characterize config generation.
- Mock fetchers and AI calls to test orchestration without network.
- Add regression test for vector fallback behavior.

### PR 4: Research Cost-Control Boundary

Purpose: isolate the heaviest token path before pilot usage scales.

Target shape:

- `backend/app/research/config.py`
- `backend/app/research/source_processing.py`
- `backend/app/research/gpt_researcher_runner.py`
- `backend/app/research/cost_guard.py`
- `backend/app/research/service.py`

Approach:

- Add a `ResearchBudget` object with max sources, max iterations, model, and token ceilings.
- Route all research model calls through usage telemetry.
- Make source selection programmatic before model synthesis.
- Add explicit failure modes for budget exceeded, no useful sources, and search provider unavailable.

Tests:

- Budget guard unit tests.
- Source ranking tests.
- Mocked end-to-end research run that asserts telemetry/cost events are emitted.

### PR 5: Workstream Scan Consolidation

Purpose: reduce duplicate discovery logic and make scan behavior predictable.

Scope:

- Share query generation and fetch orchestration with the discovery package.
- Keep workstream-specific limits and auto-add behavior separate.
- Add tests for scan rate limits, scope filters, and card insertion behavior.

### PR 6: Router Slimming

Purpose: keep FastAPI routers as transport layers.

Scope:

- Move analytics query assembly into `backend/app/analytics_service.py` or `backend/app/analytics/*`.
- Move Kanban permission/action orchestration into `backend/app/workstreams/kanban_service.py`.
- Keep request/response models in `backend/app/models`.
- Keep auth dependencies and rate limits in routers.

Tests:

- Router tests for auth and response status.
- Service tests for branching logic.

### PR 7: Workstream Kanban Frontend Split

Purpose: make collaboration and Kanban behavior reviewable.

Target shape:

- `pages/WorkstreamKanban.tsx` as route shell only.
- `components/kanban/KanbanHeader.tsx`
- `components/kanban/KanbanFilters.tsx`
- `components/kanban/KanbanModals.tsx`
- `hooks/useWorkstreamKanban.ts`
- `hooks/useKanbanSelection.ts`
- `hooks/useKanbanResearchStatus.ts`

Approach:

- Extract hooks without changing JSX first.
- Extract header/filter panels next.
- Extract modal coordination last.
- Keep drag/drop board behavior untouched until state ownership is clear.

Checks:

- `npx tsc --noEmit`
- Focused Vitest coverage for hooks where practical.
- Manual board smoke test after each PR.

### PR 8: Secondary Frontend Bundle Cleanup

Purpose: reduce bundle weight and lower incidental page risk.

Scope:

- Split static guide pages into data arrays and reusable section components.
- Split `DiscoveryQueue.tsx` into hooks and presentational sections.
- Consider lazy-loading heavy chart and detail components.

Checks:

- `pnpm build`
- Confirm Vite chunk warnings improve or document remaining heavy chunks.

## Review Checklist For Each PR

- Does the PR keep behavior stable?
- Are moved functions covered by either existing tests or new characterization tests?
- Are imports and module boundaries clearer than before?
- Is the PR small enough to review in one sitting?
- Are new modules named by domain responsibility rather than implementation detail?
- Did local checks pass, and are warnings called out explicitly?
- Did the PR avoid changing unrelated files?

## Merge Criteria

A PR can merge only when:

- CI/CD checks pass.
- Required reviewers have completed review.
- All actionable review comments are resolved.
- Any known residual risk is documented in the PR.
- Deployment implications are clear.

## Initial Recommendation

Start with PR 1 and PR 2. The export service is the largest module and has clearer extraction boundaries than discovery or research. Once the team is comfortable with the refactor pattern, move to discovery and research, where the payoff is higher but the blast radius is larger.

