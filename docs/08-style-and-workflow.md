# 08 — Style & Workflow

How we ship. Codified because the repo has one human and a rotating cast of
AI agents, and consistency is the only thing that scales.

## The small-PR ethos

Default to many small, targeted PRs over one big one. Each PR should have
one clear purpose ("delete dead alias layer", "centralize model defaults",
"fix stale docstrings") and a small diff.

If you find yourself making three unrelated changes in one branch, split
before pushing. A 30-line PR ships faster than a 300-line PR every time.

Concrete rules:

- **One purpose per PR.** If you can't write the title in under 70 chars,
  the scope is too big.
- **Branch fresh from `main`.** Don't stack on an unmerged branch unless
  the work genuinely depends on it.
- **Commit + push + open the PR as soon as the unit is coherent.** Don't
  accumulate work locally across a session.
- **Branch naming**: `<type>/<short-slug>`, matching the conventional-commit
  prefix. Examples: `refactor/remove-model-alias-table`,
  `fix/heartbeat-event-loop`, `docs/claude-md-model-stack`.

This is why a "model stack cleanup" might ship as four PRs: CLAUDE.md
edits, `openai_provider.py` refactor, `research_service.py` defaults, and
docstring fixes — instead of one big "model cleanup" branch.

## Conventional commits

| Prefix      | Use for                             |
| ----------- | ----------------------------------- |
| `feat:`     | New user-facing feature             |
| `fix:`      | Bug fix                             |
| `refactor:` | Restructure without behavior change |
| `perf:`     | Performance improvement             |
| `docs:`     | Docs-only change                    |
| `test:`     | Tests-only change                   |
| `chore:`    | Tooling, deps, build config         |

## `/babysit-pr` is the default merge path

After opening a PR, run `/babysit-pr <N>`. The agent:

1. Polls for CodeRabbit, Codex, Greptile, and Sourcery comments.
2. Reads each as it lands.
3. Addresses each (push a fix, or reply if we disagree).
4. Loops until every comment is resolved and CI is green for two
   consecutive quiet ticks.
5. **Auto-squash-merges with `--delete-branch`** when clean.

This overrides the older "maintainer merges the final" rule for any PR
that goes through `/babysit-pr`. If you want manual merge approval for a
specific PR, pass `--no-merge`.

## Code hygiene: fix-as-you-go

This codebase has no external contributors. There is no "someone else's
code" to leave alone. Pre-existing lint warnings compound if every agent
ignores them.

- **Touched-file rule.** If you edit a file and `ruff check` or `eslint`
  reports issues in it, fix the in-file issues as part of the same change.
  Don't open a separate PR for trivia in the file you're already editing.
- **Auto-fix what's safe.** `ruff check --fix` and `eslint --fix` for
  `F401` (unused imports), `F541` (f-strings without placeholders),
  unused `eslint-disable` directives, similar mechanical fixes. Run them
  on the files you touched; don't blanket-apply across the repo in a
  feature PR.
- **Don't bypass.** No `# noqa`, `eslint-disable`, `// @ts-ignore`, or
  `--no-verify` to make a check pass. If a rule genuinely doesn't fit,
  change the rule in `pyproject.toml` / `eslint.config.js` and explain why
  in the commit.
- **Cleanup PRs welcome.** When you notice a cluster of pre-existing
  issues outside the files you're touching, open a separate small PR
  scoped to that cleanup rather than mixing it into a feature PR.
- **`react-hooks/exhaustive-deps` deserves judgment.** Some warnings are
  intentional (adding the dep would cause a re-render loop). When you keep
  one, leave a one-line comment explaining why. Don't just disable.

## Coding style cues

The agent rules in [CLAUDE.md](../CLAUDE.md) are the source of truth. The
highlights:

- **Match effort to task.** ≤3-file obvious fixes: execute directly.
  Larger or ambiguous: use `/plan`. Don't spawn agents or load skills for
  trivia.
- **Check downstream before modifying.** Use the `impact_check` MCP tool
  before changing a function signature, renaming, or deleting.
- **Input handling.** Validate at the boundary, parameterize SQL, check
  authz before sensitive ops. Don't add defensive guards inside pure
  functions.
- **Match existing code.** Before adopting an import path, naming style,
  or framework pattern, grep for ≥2 existing examples. The codebase wins
  over your default preference.
- **Self-correct silently.** Fix typos and obvious syntax errors inline;
  don't announce each one.
- **Destructive operations require a one-line description before
  execution** and only proceed if the user explicitly asked for them.

Comments:

- Default to writing no comments. Only add one when the **why** is
  non-obvious: a hidden constraint, a subtle invariant, a workaround for a
  specific bug, behavior that would surprise a reader.
- Don't explain **what** the code does — well-named identifiers already do
  that.
- Don't reference the current task, PR, or callers ("used by X", "added
  for the Y flow", "handles issue #123"). Those belong in the PR
  description and rot as the codebase evolves.

## Pre-merge checks

For changes that touch ≥6 files, or touch auth / input handling /
payments, run `/freview` before reporting done. It launches the
`final-review-completeness` and `principal-code-reviewer` agents in
parallel against current session work.

For smaller changes the edit-hook self-check output is sufficient.

## Git safety

- Never `git push --force` without an explicit ask. Never to `main`.
- Never `--no-verify` to skip hooks. Fix the hook failure or fix the rule.
- Never `--amend` after a pre-commit hook fails — that mutates the
  _previous_ commit. Make a new one.
- Never edit `.git/config` to silence hooks or signing.
- Avoid `git add -A` / `git add .` blindly — stage specific paths so you
  don't accidentally commit `.env` or large binaries.

## Memory + MCP

- `Ref` MCP for any public library / framework / API question (don't
  fall back to WebSearch / WebFetch / memory for those).
- `context-layer` MCP for code intelligence on this repo (`semantic_lookup`,
  `impact_check`, `symbol_context`, `brain_search`, `mistake_log`).
- Order of preference: `Ref` for external docs, `context-layer` for this
  codebase, raw file reads only when neither applies.

## When something is wrong

If you find a real bug in code you're not currently changing and a fix
fits in one obvious line, fix it. If it needs more thought, leave it for
its own PR — flag it via `spawn_task` for later rather than half-doing it
mid-change.

If you find a memory entry that disagrees with current code, trust the
code, update the memory.
