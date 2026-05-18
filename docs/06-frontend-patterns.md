# 06 — Frontend Patterns

React SPA in `frontend/foresight-frontend/`. Built with Vite, served from
Vercel, talks to the API in `lib/<feature>-api.ts` clients.

## Top-level shape

- `src/App.tsx` — `BrowserRouter` + `Routes`, every page lazy-loaded except
  `Login` and `Dashboard` (critical path). Routes wrapped in `<ProtectedRoute>`.
- `src/pages/` — 48 page components. Names match URL segments
  (`Discover`, `DiscoveryQueue`, `WorkstreamFeed`, `WorkstreamKanban`,
  `PortfolioDetail`, `AskForesight`, `AdminConsole`, etc.).
- `src/components/` — reusable UI. Subdirs:
  - `components/ui/` — shadcn/ui base components
  - `components/kanban/` — `@dnd-kit` board for workstreams
  - `components/portfolios/` — portfolio modals
- `src/hooks/` — shared hooks (see below)
- `src/lib/` — API clients + utilities (one file per backend feature)

## API client convention

All HTTP goes through `lib/<feature>-api.ts` modules using a shared
`apiRequest<T>(endpoint, token, options)` helper. **One file per backend
feature** — don't mix workstream and portfolio calls into one client.

Examples already on disk:

- `discovery-api.ts`, `workstream-api.ts`, `portfolios-api.ts`,
  `analytics-api.ts`, `chat-api.ts`, `cost-api.ts`, `feeds-api.ts`,
  `notifications-api.ts`, `frameworks-api.ts`, `lens-api.ts`,
  `comments-api.ts`, `collaboration-api.ts`, `dashboard-api.ts`,
  `card-artifacts-api.ts`, `share-links-api.ts`, `safety-api.ts`,
  `source-rating-api.ts`, `quality-api.ts`, `activity-api.ts`,
  `admin-api.ts`, `card-followers-api.ts`

`lib/config.ts` is the **single source** for `API_BASE_URL`. Don't
re-derive it from `import.meta.env.VITE_API_URL` in feature files.

`lib/supabase.ts` exports the singleton Supabase client.

## Hooks worth knowing

- `useAuthContext` — current user + profile + token. Most page components
  use this to grab the bearer token before an API call.
- `useChat` — chat UI state (sessionStorage cache + Supabase persistence).
  Restore priority: prop → sessionStorage → Supabase query → empty state.
  `forceNew` prop on `ChatPanel`/`useChat` skips auto-restore (used by the
  "New Chat" button).
- `useDashboardData`, `useWorkstreamForm`, `useWorkstreamPreview`,
  `useWorkstreamScanPolling`, `useExportWithProgress`, `useFollowCard`,
  `useKeywordSuggestions`, `useScrollRestoration`, `useSpeechToText`,
  `useDebounce`, `useChatKeyboard`, `useCommandPaletteShortcut`,
  `useCapabilities`, `use-mobile`.
- `useCardLoader` (called from Discover, Signals, etc.) paginates with
  **`PAGE_SIZE = 30`**. Matches the backend's expected `limit`.

## Virtualization

Long card lists use `@tanstack/react-virtual` through `VirtualizedGrid`
and `VirtualizedList` (Discover + Signals). Don't render thousands of
cards directly into the DOM — wrap.

## Design system

Tailwind tokens (defined in `frontend/foresight-frontend/tailwind.config.ts`):

| Token                   | Hex       | Use                            |
| ----------------------- | --------- | ------------------------------ |
| `brand-blue`            | `#44499C` | Primary brand, headings, links |
| `brand-green`           | `#009F4D` | Confirm/success/positive       |
| `dark-surface`          | `#2d3166` | Default dark mode surface      |
| `dark-surface-elevated` | `#3d4176` | Cards, modals on dark          |
| `dark-surface-hover`    | `#4d5186` | Hover state on dark            |
| `dark-surface-deep`     | `#1a1d40` | Backdrop / deepest layer       |

Rules:

- Use tokens, not raw hex.
- Modals: `rounded-xl shadow-2xl` + `bg-black/50 backdrop-blur-sm` backdrop.
- Cards: `rounded-xl`. Transitions: `duration-200` (never bare
  `transition-all`).
- Custom `scrollbar-thin` utility lives in `src/index.css` (not a plugin).
- Smooth scroll + `::selection` styling are in `index.css`.
- `bg-gray-850` is **not** a valid Tailwind class (valid range: 50–950 in
  50/100 increments).

## Dark mode

`next-themes` provider in `App.tsx`. All components opt in via `dark:`
prefix classes throughout. Use tokens, not raw colors.

## TypeScript

- Strict mode is on. Project references are configured.
- **Always type-check with `npx tsc -b --noEmit`** in
  `frontend/foresight-frontend/`. Plain `tsc --noEmit` silently passes
  while real errors hide because of project references.
- Non-null assertions (`!`) are appropriate for regex match groups.
- `CardDetail/utils.ts` re-exports `API_BASE_URL` from `lib/config.ts` —
  that's the only legal place to alias it.

## Forms

- `react-hook-form` + `zod` resolvers (`@hookform/resolvers/zod`).
- shadcn `Form` primitives in `components/ui/form.tsx`.

## State / data fetching

There is no global state library (Redux/Zustand). Pattern:

- Component-local `useState` / `useReducer` for UI state.
- `useEffect` to call the relevant `lib/<feature>-api.ts` function on
  mount, with the token from `useAuthContext`.
- Caches that need to survive page navigation use sessionStorage (e.g.
  chat) or are re-fetched.
- Supabase realtime subscriptions used sparingly (presence, job_events
  surfaces).

## Routing notes

- All app routes are SPA — Vercel rewrites `/*` to `/index.html`.
- `<LoginRoute>` wraps `/login` to bounce already-signed-in users.
- React Router treats `//host` as in-app, so absolute external links must
  not be expressed as path-relative.

## Tests

- **Unit**: Vitest + jsdom. Run `pnpm test:run` for a one-shot. `__tests__/`
  subdirs hold colocated tests (`lib/__tests__/`, `hooks/__tests__/`,
  `components/__tests__/`).
- **E2E**: Playwright. `pnpm test:e2e` headless, `pnpm test:e2e:headed`
  with browser visible.

## Don't

- Don't import `API_BASE_URL` from anywhere except `lib/config.ts` (or the
  one allowed re-export in `CardDetail/utils.ts`).
- Don't drop the `apiRequest<T>` helper and inline `fetch` calls in a new
  client.
- Don't put dark-mode-aware styles inline as hex — use tokens.
- Don't `tsc --noEmit` without `-b`.
- Don't render an unbounded card list without `VirtualizedGrid` /
  `VirtualizedList`.
