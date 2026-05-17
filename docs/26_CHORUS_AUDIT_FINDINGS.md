# Chorus Audit — Findings & PR Plan

**Run date**: 2026-05-17
**Chorus chat**: `019E369FDAB3B1088A57C13A2DD2332C` — local Chorus UI at `http://127.0.0.1:5050/runs/bug-hunting-and-code-quality-audit-of-the-foresight-codebase` (local-only reference; not reachable externally — the chat id above is the canonical handle if you need to look up the run elsewhere).
**Template**: `review-only` (6 reviewers, single pass)
**Base commit**: `738456f` (post-merge of PR #124 perf/page-load-improvements)
**Verdict**: `request_changes` — 1/6 nominal agreement (the only reviewer that "approved" was reviewing the brief itself, not the code)

## Reviewer participation

| Reviewer        | Lineage   | Status       | Notes                                                                                                               |
| --------------- | --------- | ------------ | ------------------------------------------------------------------------------------------------------------------- |
| `claude-code-2` | anthropic | ✅ completed | Meta-reviewed the brief itself, did not audit code                                                                  |
| `claude-code-4` | anthropic | ✅ completed | Full audit, 10 findings                                                                                             |
| `claude-code-5` | anthropic | ✅ completed | Full audit, 33 findings                                                                                             |
| `codex-cli-0`   | openai    | ✅ completed | Full audit, 15 findings                                                                                             |
| `gemini-cli-1`  | google    | ❌ failed    | Did not see the repo despite `repoPath` being set — only had the brief artifact. Re-run needed for Gemini coverage. |
| `kimi-cli-3`    | moonshot  | ❌ failed    | `kimi exited 1: LLM not set` — provider config issue, not our codebase.                                             |

Raw answer files: `~/.chorus/chats/019E369FDAB3B1088A57C13A2DD2332C/round-1/reviewer-*/answer.md`

> **Coverage gap**: Gemini and Kimi did not produce reviews. If you want a second-lineage cross-check on these findings, re-run with template `tri-review` (Claude produces → Codex + Gemini + Kimi review) or open a separate chat targeting Gemini specifically. Codex + Claude are well-represented here.

---

## How to use this doc

Each finding is a checkbox. **Verify before fixing** — Chorus reviewers don't see the full project context and some items may be false positives or intentional patterns. The "Why this could be wrong" note flags the obvious risks.

Findings are grouped into **suggested PR batches**. Each batch is sized to fit in one PR + babysit cycle. Order is roughly highest-impact-first; you can re-order.

Where multiple reviewers agreed on the same finding, it's marked **[2×]** or **[3×]**.

---

## Immediate action (not a PR)

- [ ] **SEC-1** `backend/.env` still contains values for `TAVILY_API_KEY` and `FIRECRAWL_API_KEY` even though both providers are decommissioned. File is gitignored (not exposed), but if these keys are still live at the provider, rotate/revoke them and delete the lines from `.env` so nothing can re-enable a dead code path. **[claude-code-5]**
  - **Why this could be wrong**: keys may already be revoked at provider; the env line is harmless if so.

---

## PR-A — P0 — Wrap blocking Supabase calls in `asyncio.to_thread`

Recent PRs (#115, #119, #121, #122) cleaned up many routers but coverage is incomplete. Reviewers found several hot paths still blocking the event loop.

- [ ] `backend/app/ai_helpers.py:54, 65, 72` — `create_card_from_topic` does sync `supabase.table(...).insert(...).execute()` inside an `async def`. **[claude-code-4]**
- [ ] `backend/app/worker.py:227–236, 245–259, 286–294, 372–380, 485–492, 510–517` — multiple worker async methods (`_process_one_research_task`, `_process_one_brief`, `_process_one_discovery_run`, `_process_one_workstream_scan`) call sync Supabase directly in polling/claim queries. **[claude-code-4]**
- [ ] `backend/app/enrichment_service.py:122–128, 137–142, 199–202, 238, 243, 256, 270–290, 357–363` — `enrich_weak_signals()` / `enrich_card()` bare `.execute()` calls. **[claude-code-5]**
- [ ] `backend/app/signal_agent_service.py:818–831, 964, 1232–1239, 1401–1404, 1674–1731, 1758–1760, 1902–1907, 1977–1979, 2080` — signal agent hot path: `_process_pillar_batch`, `_prefetch_related_signals`, `_tool_search_existing_signals`, `_tool_attach_source_to_signal`, `_get_or_create_card`, `_create_and_index_source`. **[claude-code-5, codex-cli-0]** **[2×]**
- [ ] `backend/app/routers/portfolios.py:169–179, 282` — portfolio endpoints call sync client in async funcs. **[codex-cli-0]**
- [ ] `backend/app/routers/analytics.py:396, 781, 2108` — analytics endpoints with blocking calls. **[codex-cli-0]**

**Why this could be wrong**: some "async" functions are actually called from sync contexts via `asyncio.run(...)` and don't need wrapping; verify each call site is on an event-loop-bound path before wrapping.

---

## PR-B — P0 — Worker terminal-status race guards

Per the PR #61 lesson — terminal `completed`/`failed` writes must check current status, or a late heartbeat can revert `failed` → `running`. Reviewers found three more services that need the same guard.

- [ ] `backend/app/worker.py:460–467, 471–478, 562–568, 570–577` — timeout/exception handlers write status updates without a current-status check. **[claude-code-4]**
- [ ] `backend/app/routers/discovery.py:239–244, 493–504` + `backend/app/discovery_service.py:4047–4074` — discovery final writes can overwrite a cancelled/failed run with completed results. Make terminal updates conditional on `status = 'running'` and treat zero updated rows as already-terminal. **[codex-cli-0]**
- [ ] `backend/app/workstream_scan_service.py:1497–1519` + `backend/app/routers/workstream_scans.py:357–363` + `backend/app/worker.py:562–568` — workstream scan completion/failure writes are also unconditional. Guard with `eq("status", "running")` or an atomic RPC. **[codex-cli-0]**

**Why this could be wrong**: some of these may already have the guard implemented but the reviewer missed it; spot-check first.

---

## PR-C — P0 — `datetime.utcnow()` → `datetime.now(timezone.utc)` cleanup

CLAUDE.md mandates timezone-aware datetimes. Naive timestamps will silently mismatch DB UTC-aware columns and crash on comparison in Python 3.11+.

- [ ] `backend/app/security.py:501` — `datetime.utcnow().isoformat()`. **[claude-code-5]**
- [ ] `backend/app/brief_service.py:439, 588, 909` — three naive timestamps written to DB. **[claude-code-5, codex-cli-0]** **[2×]**
- [ ] `backend/app/export_service.py:1984, 2591, 3821` — naive timestamps in export filenames/metadata. **[claude-code-5]**
- [ ] `backend/scripts/pipeline_consistency_monitor.py:112, 126, 232, 358` — naive `datetime.utcnow()` in comparisons against DB timestamps. **[claude-code-5]**

Single, mechanical replacement. Add `from datetime import timezone` where missing.

---

## PR-D — P0 — Frontend PostgREST `.or()` wildcard sanitizer

Our `escapeKeywordForOr` (WorkstreamFeed) and `escapeSearchTermForOr` (Discover) strip `%`, `_`, commas, and parens — but **leave `*` and `\` alone**. PostgREST accepts `*` as a LIKE wildcard, so an unsanitized `*` from the user becomes a server-side wildcard.

- [ ] `frontend/foresight-frontend/src/pages/WorkstreamFeed/api.ts:62–99` and `frontend/foresight-frontend/src/pages/Discover/hooks/useCardLoader.ts:131–132` — extend sanitizer to also strip `*` and `\`. Ideally consolidate into one shared helper. **[codex-cli-0]**

Small, focused PR. Worth a vitest case covering each disallowed char.

---

## PR-E — P0 — Saved-search router ownership leak (403 → 404)

CLAUDE.md says "return 404 (not 403) to avoid leaking existence". Three saved-search endpoints return 403 instead.

- [ ] `backend/app/routers/search.py:154–163, 236–243, 320–327` — distinguish "another user's resource" from "missing". Query by both `id` and `user_id`, or return 404 for ownership mismatch. **[codex-cli-0]**

Small, focused PR.

---

## PR-F — P0 — Embedding zero-vector fallback in failure paths

`rag_engine.py:213–217` correctly falls back to `[0.0] * 1536` when embedding fails. Two other callers don't, so they abort instead.

- [ ] `backend/app/ai_service.py:488–492` — final embedding failure raises instead of returning zero vector. **[codex-cli-0]**
- [ ] `backend/app/recovery_service.py:27–35` — same pattern. **[codex-cli-0]**

---

## PR-G — P1 — Tavily/Firecrawl decommission residue

`SEC-1` covers the .env keys. These are the remaining code/doc references that should be ripped out.

- [ ] `backend/requirements.txt:25–26` — drop `tavily-python` and `firecrawl-py`. **[claude-code-4, codex-cli-0]** **[2×]**
- [ ] `backend/app/routers/health.py:95–96` — debug endpoint reads + reports `TAVILY_API_KEY`/`FIRECRAWL_API_KEY` presence (info leak about decommissioned providers). **[claude-code-5, codex-cli-0]** **[2×]**
- [ ] `backend/.env.example:69, 147, 156, 159, 162, 179–189` — still documents Tavily/Firecrawl as valid providers; will mislead operators. **[claude-code-5]**
- [ ] `docker-compose.yml:43, 83` — comments list `tavily` as a valid `SEARCH_PROVIDER` and reference it in the SearXNG description. **[claude-code-5, codex-cli-0]** **[2×]**
- [ ] `frontend/foresight-frontend/src/pages/HowItWorks/ChatAgentTools.tsx:25` — user-facing string "Live web search via Tavily". **[claude-code-4, codex-cli-0]** **[2×]**
- [ ] `frontend/foresight-frontend/src/pages/Methodology/sections/Pipeline.tsx:32` — mentions Tavily in pipeline doc. **[codex-cli-0]**
- [ ] `frontend/foresight-frontend/src/lib/discovery/runs.ts:17` — TypeDoc comment uses `tavily` as a source-type example. **[claude-code-4]**

After this PR, grep should return zero hits for `tavily` and `firecrawl` (case-insensitive) outside of changelog, audit findings, and other historical docs (this file itself preserves those terms for context).

---

## PR-H — P1 — Model routing: hardcoded names + admin allowlist

CLAUDE.md mandates routing through `openai_provider.py`. Three places bypass it.

- [ ] `backend/app/gamma_service.py:1016, 1677` — hardcoded `"gpt-image-2"`. If image generation is intentional and not on the chat tier, add an image-model accessor to `openai_provider.py` and route through it; otherwise document why. **[claude-code-4]**
- [ ] `backend/backfill_embeddings.py:144–145` — test stub hardcodes `"gpt-4o-mini"` / `"gpt-4o"` (retired). Route through `openai_provider.get_chat_mini_deployment()` / `get_chat_deployment()`. **[claude-code-5]**
- [ ] `backend/app/openai_provider.py:80–90` + `backend/app/routers/admin.py:759–791` — admin-settable model field accepts arbitrary IDs, including retired `gpt-5.5`. Validate against the production allowlist (`gpt-5.4`, `gpt-5.4-mini`) before saving. **[codex-cli-0]**
- [ ] `frontend/foresight-frontend/src/pages/HowItWorks/index.tsx:186` — copy says pattern generation uses GPT-5.5. Replace with the routed current model tier or drop the specific name. **[codex-cli-0]**

---

## PR-I — P1 — Silent `except Exception: pass` blocks

Lots of these. They mask failures in production with zero trace. The fix is mechanical: add `logger.warning(..., exc_info=True)` (or `logger.debug` if the path is genuinely best-effort and frequent).

Reviewers found ~30 instances across these files (all from `claude-code-5`):

- [ ] `backend/app/enrichment_service.py:257–258, 291–292, 423–424`
- [ ] `backend/app/signal_agent_service.py:1865–1866`
- [ ] `backend/app/discovery_service.py:1495–1496, 1826–1827, 3869–3870` (comments say "non-fatal" — keep behavior, just log)
- [ ] `backend/app/digest_service.py:449–450, 564–565, 922–923, 964–965`
- [ ] `backend/app/workstream_scan_service.py:245–246, 1326–1327, 1385–1386`
- [ ] `backend/app/research_service.py:500–501, 663–664`
- [ ] `backend/app/rss_service.py:559–560`
- [ ] `backend/app/routers/chat.py:86–87, 101–102, 111–112, 126–127, 141–142, 1201–1202, 1213–1214`
- [ ] `backend/app/quality_service.py:447–448`
- [ ] `backend/app/routers/card_export.py:387–388`
- [ ] `backend/app/scheduler.py:397–398, 523–524`

**Why this could be wrong**: some of these may be intentional best-effort patterns where logging at WARNING would create noise (e.g., RSS feed parse failures on flaky third-party feeds). Walk through each and pick the right log level case-by-case rather than blanket-applying WARNING.

Consider splitting into two PRs: chat/scheduler (P0-ish, user-visible paths) and the rest (P1).

---

## PR-J — P1 — Frontend non-null assertions → explicit guards

Non-null assertions (`!`) on values that could legitimately be null/undefined will throw at runtime if the optimistic assumption breaks.

- [ ] `frontend/foresight-frontend/src/components/lens/LensFlagChips.tsx:63, 79` — `budgetRelevance!`, `climateRelevance!` on props from optional API fields. Add null guards or make prop type nullable with conditional render. **[claude-code-5]**
- [ ] `frontend/foresight-frontend/src/pages/WorkstreamKanban/useKanbanCardOperations.ts:87, 241, 244` — `sourceCard!`, `sourceStatus!` in drag-and-drop path; if card is moved concurrently or store hasn't hydrated, throws. Replace with early-return guard. **[claude-code-4, claude-code-5]** **[2×]**

---

## PR-K — P1 — Raw `dict` responses → Pydantic `response_model=`

Endpoints returning bare dicts can silently leak accidental keys (or drop renamed fields) without a test catching it.

- [ ] `backend/app/routers/card_subresources.py:626, 650, 789` — three endpoints. **[claude-code-5]**
- [ ] `backend/app/routers/share_links.py:162` — single endpoint. **[claude-code-5]**
- [ ] `backend/app/routers/research.py:419` — single endpoint. **[claude-code-5]**
- [ ] `backend/app/routers/admin_discovery.py` lines 104, 219, 391, 513, 686, 882, 1089, 1535, 1673, 1737, 1905, 1944, 1966, 1995, 2124 — 15 admin endpoints returning raw dicts. **[claude-code-5]**

Big surface area; consider splitting admin_discovery into its own PR.

---

## PR-L — P1 — VirtualizedGrid.test.tsx — meaningful "Configuration Props" assertions

- [ ] `frontend/foresight-frontend/src/components/__tests__/VirtualizedGrid.test.tsx:178–224` — every "accepts X prop" test asserts only `expect(container).toBeInTheDocument()`, which always passes after any render. Replace with assertions that verify the prop _does something_ (e.g., `gap` affects computed grid-gap, `overscan` changes virtualizer buffer). **[claude-code-4]**

Small, but the test file was just expanded as part of PR #124. Worth doing while context is fresh.

---

## PR-M — P2 — Extract `_log_admin_action` into a service module

- [ ] `backend/app/routers/admin_discovery.py:61, 1597, 2022, 2092, 2153` — five import sites pull the prefixed-private `_log_admin_action` helper from `app.routers.admin`, a direct router-to-router dependency that violates the service-layer rule. Move into `backend/app/audit_service.py` (new file) and update both routers to import from there. **[claude-code-5, codex-cli-0]** **[2×]**

---

## PR-N — P2 — Modal design-system consistency

- [ ] `frontend/foresight-frontend/src/components/collaboration/ShareWorkstreamModal.tsx:58` — modal uses `rounded` instead of `rounded-xl`. **[claude-code-5]**
- [ ] `frontend/foresight-frontend/src/components/ShareSignalModal.tsx` — overlay missing `backdrop-blur-sm`. **[claude-code-5]**
- [ ] `frontend/foresight-frontend/src/components/CardDetail/tabs/OverviewTab/DescriptionHistory.tsx` — backdrop overlays missing `backdrop-blur-sm`. **[claude-code-5]**
- [ ] `frontend/foresight-frontend/src/hooks/useChat/useRestoreConversation.ts:79` — bare `eslint-disable-next-line react-hooks/exhaustive-deps` with no explanatory comment. Add one-line rationale. **[claude-code-4]**

All small, all one PR.

---

## P2 — Noted but not actioned

- `backend/app/main.py` is 255 lines vs ~230 budget — close but not worth a PR on its own. Avoid adding more lifespan logic inline. **[claude-code-4, claude-code-5]** **[2×]**

---

## Items confirmed clean (no action)

From the reviewers' own "no findings here" passes:

- SQL/PostgREST injection: `.ilike()` calls go through `sanitize_ilike` / `escapeKeywordForOr` — coverage looked OK (modulo the `*`/`\` gap in PR-D above).
- Datetime handling in routers: most paths already use `datetime.now(timezone.utc)`; the residue is in services (covered in PR-C).
- Telemetry: code uses `estimated_cost_usd` correctly; `cost_usd` in `abuse.py` is an internal dict key, not a DB column.
- `models/__init__.py`: all exports re-exported and listed in `__all__`.
- pgvector `search_path = extensions, public` present in RPC functions.
- Empty-vector fallback in `rag_engine.py:213–217` correct.
- `useEffect` `eslint-disable` directives generally have rationale (the one exception is in PR-N).
- Invalid Tailwind color shades (`bg-gray-850`): none found.
- `VirtualizedGrid.onEndReached` infinite-loop risk: mount-time underfill guard and consumer empty-page hopping correct.
- Cursor pagination off-by-one in `useCardLoader.ts`: over-fetches by 1, resets cursor on filter change — correct.

---

## Re-running for fuller coverage

If you want Gemini + Kimi in the mix:

1. **Re-run with `tri-review`** — Claude produces, Codex + Gemini + Kimi review. The producer phase forces Claude to generate something for the others to review, which works less well for a working-tree audit but does guarantee Gemini and Kimi participate.
2. **Fix Kimi config** first — `kimi-cli-3` failed with "LLM not set". Likely a missing env var on the Chorus daemon side.
3. **For Gemini specifically** — try running `audit-code-review` instead (lineages: [] — daemon picks; may or may not route to Gemini), or open a Gemini-only review chat targeting just the recently-changed files (smaller artifact, easier for the sandbox to handle).
