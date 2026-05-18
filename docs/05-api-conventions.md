# 05 — API Conventions

How the FastAPI surface is shaped. If a new endpoint doesn't follow these,
the next reviewer will flag it.

For the full list of routers, see `backend/app/routers/` (37 files). For
authn/rate-limit details beyond what's here, see [SECURITY.md](./SECURITY.md).

## URL shape

- All endpoints under **`/api/v1/...`**.
- User-scoped endpoints use **`/api/v1/me/...`** (e.g. `/me/workstreams`,
  `/me/cards/follows`, `/me/portfolios`).
- One router per feature surface. File naming: `routers/<feature>.py`.
- Don't add endpoints to `main.py`. Pick or create a router.
- Use kebab-case URL segments where natural; resource segments are plural
  (`/cards/{id}`, `/workstreams/{id}/scans`).

## Auth

- Bearer JWT from Supabase Auth. The shared dependency is
  `Depends(get_current_user)` in `app/deps.py`.
- `get_current_user` verifies the JWT and returns the user profile dict. It
  has a 5-minute TTL profile cache; the cache check is wrapped in
  `asyncio.to_thread(...)` so it doesn't block the loop.
- Service-role Supabase client (`supabase` from `deps.py`) is used on the
  server. RLS is enabled at the DB but routers enforce per-user authz
  explicitly.

## Authz patterns

**Org-vs-user resources.** Workstreams (and anything with an `owner_type`)
should 404 — not 403 — when the caller doesn't have access. Don't leak
existence:

```python
ws = supabase.table("workstreams").select("*").eq("id", ws_id).single().execute().data
if ws is None:
    raise HTTPException(404)
if ws.get("owner_type") != "org" and ws.get("user_id") != user_id:
    raise HTTPException(404)
```

**Admin endpoints.** Routers under `admin*` (`admin.py`, `admin_discovery.py`,
admin lens endpoints) gate on the admin flag in `app/authz.py`. They also
write `admin_audit_log` rows.

## Pydantic everywhere

- Request bodies, query params, and responses are typed with Pydantic v2
  models in `backend/app/models/<feature>.py`.
- New models must be added to the file **and** re-exported from
  `models/__init__.py` (both the import list and `__all__`).
- Use `response_model=` on routes for output contracts (see PRs #144–#146).
  That gives OpenAPI accuracy and trims fields the model doesn't declare.

## Errors

- Raise `HTTPException(status_code, detail=...)`. Don't return JSON error
  envelopes manually.
- 404 over 403 for ownership-protected resources (above).
- 422 is FastAPI's automatic validation response — let it happen, don't
  catch and rewrite.
- 429 is the rate-limit response from `slowapi` (`app/security.py`).

## Rate limiting + security middleware

- `app/security.py` registers `RateLimitMiddleware`, security headers, and
  a request-size cap.
- Sensitive endpoints (auth-adjacent, expensive AI, write-heavy) decorate
  with `@rate_limit_*` decorators from `security.py`.
- CORS allowlist: `ALLOWED_ORIGINS` env var (comma-separated). In
  production (`ENVIRONMENT=production`), the validator rejects non-HTTPS
  origins and `localhost`.

## Streaming endpoints (SSE)

- Chat (`routers/chat.py`) streams Server-Sent Events. The streaming loop
  uses `while True` with `async for ... else: break` over the OpenAI
  stream so that re-streaming after a tool call is possible.
- Tool-call rule: every `tool_call` the model emits must get a matching
  `tool` response in the next message — including unknown tools and "limit
  reached" cases. Otherwise the stream stalls.

## Async + Supabase

- The supabase-py sync client blocks the event loop. From async paths, wrap
  calls in `asyncio.to_thread(...)`. Examples in `analytics.py`,
  `discovery_service.py`, and `deps.py`.
- For parallel I/O, batch with `asyncio.gather(...)`.

## Pagination

- Discovery and signals use cursor-or-offset pagination through the
  `useCardLoader` hook on the frontend with `PAGE_SIZE = 30`.
- Backend routes accept `limit` and either `offset` or `cursor`. Match the
  conventions in the existing router; don't invent a new pagination shape
  for one new endpoint.

## Long-running work

If an operation takes more than ~5s, it should not block the request. The
pattern:

1. Route inserts a job row (e.g. into `executive_briefs`,
   `discovery_runs`, `workstream_scans`).
2. Route returns `202` (or `200` with the job ID).
3. Worker picks it up and emits `job_events`.
4. UI polls the job's status endpoint (or subscribes via Supabase
   realtime, where applicable).

`asyncio.wait_for(..., timeout=1800)` is the right timeout for any direct
script invocation of discovery / signal_agent / brief generation. Anything
tighter cuts the LLM off mid-card-creation.

## What goes where (quick router map)

A few of the 37 routers are non-obvious about which one owns a feature:

| Concern                          | Router                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Card CRUD, follow, dismiss       | `cards.py`, `card_subresources.py`                                                                   |
| Card export (PDF/PPTX/CSV)       | `card_export.py`                                                                                     |
| Card review / lens / artifacts   | `card_review.py`, `lens.py`, `card_subresources.py`                                                  |
| Workstream CRUD                  | `workstreams.py`                                                                                     |
| Kanban moves                     | `workstream_kanban.py`                                                                               |
| Workstream collaboration         | `workstream_members.py`, `workstream_invites.py`, `workstream_presence.py`, `workstream_activity.py` |
| Workstream scans (deep research) | `workstream_scans.py`                                                                                |
| Portfolios + export              | `portfolios.py`                                                                                      |
| Discovery (queue, runs, prefs)   | `discovery.py`, `admin_discovery.py`                                                                 |
| Chat, mentions, suggestions      | `chat.py`                                                                                            |
| Briefs                           | `briefs.py`                                                                                          |
| Research (gpt-researcher)        | `research.py`                                                                                        |
| Analytics + dashboard            | `analytics.py`                                                                                       |
| Frameworks (CSP / PPP)           | `frameworks.py`                                                                                      |
| Pattern insights                 | `pattern_insights.py`                                                                                |
| Personalized feed                | `personalized.py`                                                                                    |
| Search                           | `search.py`                                                                                          |
| Notifications                    | `notifications.py`                                                                                   |
| Comments / reactions             | `comments.py`                                                                                        |
| Share links                      | `share_links.py`                                                                                     |
| Admin + audit + cost             | `admin.py`, `cost.py`, `usage.py`                                                                    |
| Safety / moderation              | `safety.py`                                                                                          |
| Users / profile                  | `users.py`                                                                                           |
| Health                           | `health.py`                                                                                          |

## Don't

- Don't put new endpoints in `main.py`.
- Don't bypass `get_current_user` on user-data endpoints.
- Don't return raw `dict` from a typed route — declare a response model.
- Don't hardcode model names in service code — go through `openai_provider`.
- Don't `json.dumps()` before writing JSONB.
