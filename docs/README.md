# Foresight — Project Docs

You (future you, or another agent) just landed on the repo. This folder is the
short list of things that are still true. Older `NN_*.md` files in this
directory are development artifacts (plans, PRDs, post-mortems) and will be
pruned — trust the files below, not the artifacts.

If something here disagrees with the code, the code wins. Fix the doc.

## What Foresight is

AI-powered strategic horizon scanning for the City of Austin CMO. It pulls
content from RSS feeds, news APIs, government sources, and a self-hosted
SearXNG aggregator, turns each promising item into a "card" with strategic
metadata (pillar, stage, scores, lens classifications), and surfaces it
through a kanban + chat interface aligned to Austin's strategic framework.

Single-tenant pilot. No production users yet. Conventions are optimized for a
maintainer + AI agents, not external contributors.

## Where to look

| Question                              | File                                                   |
| ------------------------------------- | ------------------------------------------------------ |
| Languages, libraries, versions        | [01-stack.md](./01-stack.md)                           |
| Services, request flow, worker        | [02-architecture.md](./02-architecture.md)             |
| Model tiers, RAG, agent, embeddings   | [03-ai-pipeline.md](./03-ai-pipeline.md)               |
| Cards, workstreams, portfolios, lens  | [04-data-model.md](./04-data-model.md)                 |
| `/api/v1/*`, auth, pagination, errors | [05-api-conventions.md](./05-api-conventions.md)       |
| React structure, hooks, design tokens | [06-frontend-patterns.md](./06-frontend-patterns.md)   |
| Vercel + Railway, env vars, health    | [07-deployment.md](./07-deployment.md)                 |
| PR ethos, `/babysit-pr`, conventions  | [08-style-and-workflow.md](./08-style-and-workflow.md) |

Plus, at repo root:

- [CLAUDE.md](../CLAUDE.md) — operational rules for an agent working in this
  repo. Read first. Has the canonical model-tier table and the things you can
  break if you ignore them (e.g. `cost_usd` vs `estimated_cost_usd`).
- [AGENTS.md](../AGENTS.md) — same idea, for non-Claude agents.
- [SECURITY.md](./SECURITY.md) — auth model, RLS posture, rate limits.

## How these docs are written

Terse. File paths over prose. Current state, not history. If a doc has
explanations that aren't load-bearing for a future fresh-context reader,
they're wrong. Delete them.

Each doc is intended to be readable in under five minutes by an agent that
has never opened the repo.

## Updating

When a PR drifts the design (renames a router, swaps a model tier, changes
the deploy topology), update the relevant doc here in the same PR. These
files are short on purpose so this is cheap.

Do not regenerate or reformat the whole doc to fix one line. Surgical edits
only — same rule that applies to the code.
