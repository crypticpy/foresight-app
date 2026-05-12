---
name: babysit-pr
description: >
  Watch a single PR through bot review (CodeRabbit, Greptile, Sourcery,
  ChatGPT Codex), address each comment by pushing a fix or replying, then
  auto-squash-merge when CI is green and review has been quiet for two
  consecutive ticks. Use when the user types /babysit-pr <N>, asks you to
  "babysit", "watch", "monitor", or "drive home" a PR. Does NOT create
  PRs — open the PR first (or have the caller open it) and then invoke
  this with the PR number.
---

# /babysit-pr — drive one PR to merge

## Usage

```
/babysit-pr <pr-number>            # watch + auto-merge when clean
/babysit-pr <pr-number> --no-merge # watch + report ready, maintainer merges
```

The PR must already exist. If the user types `/babysit-pr` without a number, ask which PR — don't guess.

## How it works

You spawn the `pr-babysitter` agent on a `/loop`. Each tick the agent does one cycle of work — poll, address, maybe merge — and returns. The loop reschedules itself until the agent reports the PR merged (or stops).

State lives in `.claude/state/pr-<N>.json` (create the parent dir if missing). The agent reads and writes it so quiet-tick counts and replied-to bookmarks survive across loop ticks.

## Steps

### 1. Parse args

- `pr_number`: first positional. Required. Must match `^\d+$`.
- `auto_merge`: true unless `--no-merge` appears in the args.

If the user passed only `--no-merge` without a number, stop and ask which PR.

### 2. Sanity check the PR exists and is open

```bash
gh pr view <N> --json state,baseRefName,headRefName -q '.state'
```

If `state != "OPEN"`, tell the user and stop. Don't try to re-open or revive.

### 3. Initialize the state file

If `.claude/state/pr-<N>.json` doesn't exist, write a fresh one:

```json
{
  "pr_number": <N>,
  "auto_merge": true,
  "quiet_ticks": 0,
  "last_seen_iso": "<PR created_at, RFC3339>",
  "replied_to": [],
  "merged": false
}
```

If it exists from a previous /babysit-pr run on the same PR, leave it alone — the agent will pick up where it left off.

### 4. Run the first tick now

Invoke the `pr-babysitter` agent foreground with a prompt that includes:

- PR number
- `auto_merge` flag
- Absolute path to the state file
- The current branch's repo root (so `gh` commands resolve correctly)

The agent will do one full cycle, write back to the state file, and return a short status report. Surface that report to the user as plain text.

### 5. Decide whether to keep looping

- If the agent reported `merged` or `error`: stop. Don't schedule another tick.
- If the agent reported `still watching` or `ready for merge` (the latter under `--no-merge`): schedule the next tick via /loop dynamic mode (see below).

### 6. Schedule the next tick

Briefly summarize what the agent did this tick. Then call `ScheduleWakeup` as the final action with:

- `prompt`: `/babysit-pr <N>` (verbatim, plus `--no-merge` if it was passed in). When the loop re-fires, this skill runs again and the next tick happens.
- `delaySeconds`: pick based on bot timing:
  - Bots typically post within 2-10 min of a push. If you pushed a fix this tick, use **270s** (4.5 min) — long enough to catch the first re-comment, short enough to stay in cache.
  - If this was a quiet tick (no new comments, no pushes), use **600s** (10 min). Less churn.
  - Never below 120s; never above 1800s. Anything past 30 min is excessive for active PRs.
- `reason`: one short sentence — "watching for re-comments after pushing fix" or "second quiet tick before merge."

That's it. The wake fires, /babysit-pr runs again, the agent does another tick.

## When to stop without scheduling

- Agent reports `merged` — done.
- Agent reports `error` — surface the error to the user, don't loop on it.
- The PR was closed (not merged) between ticks — tell the user, stop.
- Hit a hard guardrail in the agent (weird base branch, etc.) — agent should have reported "error" already.

## Guardrails this skill enforces

- **One babysitter per PR.** If `.claude/state/pr-<N>.json` shows another loop is active for this PR (timestamp within last 30 min), warn the user before starting a duplicate.
- **Don't invoke on main/master directly.** This skill is for feature-branch PRs targeting `main`, not for watching `main` itself.
- **No agent recursion.** The `pr-babysitter` agent must not spawn another `pr-babysitter`.

## Notes for the caller agent (you, the main session)

- Do NOT do the babysit work yourself — invoke the `pr-babysitter` agent each tick. Keep your own context clean so you stay responsive to the user for other tasks.
- Do NOT poll the PR or read comments outside the agent's tick. The agent is the only thing that touches GitHub during babysit.
- If the user interrupts mid-loop with a different request, you can keep handling that request — the next ScheduleWakeup tick will just pick the agent back up.
