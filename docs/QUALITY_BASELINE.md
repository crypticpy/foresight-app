# Quality Baseline

Date: 2026-05-07

This document records the current code-quality gate for PRs. It is intentionally modest: it blocks regressions while leaving known warning cleanup as planned follow-up work.

## Required PR Checks

Backend:

```bash
cd backend
ruff check app tests
python -m pytest
```

Frontend:

```bash
cd frontend/foresight-frontend
pnpm exec tsc --noEmit
pnpm exec eslint . --max-warnings=24
pnpm exec vite build
```

The GitHub Actions workflow uses direct frontend tool commands after `pnpm install --frozen-lockfile`:

```bash
pnpm exec tsc --noEmit
pnpm exec eslint . --max-warnings=24
pnpm exec vite build
```

This avoids the current `package.json` script behavior that runs `pnpm install` inside `build` and `lint`.

## Current Warning Budget

Frontend ESLint currently has 24 warnings and 0 errors. The workflow caps warnings at 24, so existing warnings do not block the baseline PR but any new warning fails CI.

Warning categories:

| Category | Count | Notes |
| --- | ---: | --- |
| `react-refresh/only-export-components` | 16 | Components and helper exports share files; split helpers/constants or move shared exports to non-component modules. |
| `react-hooks/exhaustive-deps` | 7 | Effects/callbacks need dependency cleanup or stable callback extraction. |
| Unused ESLint disable | 1 | `frontend/foresight-frontend/src/lib/logger.ts` has an unnecessary disable comment. |

Backend tests currently pass with deprecation warnings. The largest warning group is Pydantic v1-style validators and class-based config under Pydantic v2. These should be cleaned up before moving toward Pydantic v3, but they are not blocking this gate.

## Known Build Noise

- `pnpm build` currently runs `pnpm install --prefer-offline` before Vite, which can prompt locally if `node_modules` differs from the lockfile.
- Vite reports stale Browserslist data.
- Vite reports several large chunks, including `index`, `CardDetail`, `ScoreTimelineChart`, and `WorkstreamKanban`.
- Backend app import can trigger third-party deprecation warnings from transitive dependencies such as `pyiceberg`.

## Follow-Up Cleanup

Recommended order:

1. Remove install steps from frontend package scripts or add separate `*:ci` scripts.
2. Reduce ESLint warning budget from 24 to 0 in small batches.
3. Migrate Pydantic validators/config to v2 style.
4. Split large frontend chunks after the monolith extraction work begins.
5. Add targeted frontend unit tests around extracted hooks/components.
