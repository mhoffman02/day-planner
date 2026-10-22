---
name: work-the-plan
description: Use when asked to work through the plan/backlog autonomously ("keep going until X is done", long unattended sessions). Runs PLAN.md's checklist then TODO.md across many tasks with cost-tiered subagent dispatch (lite/worker/deep), independent verification before checking anything off, disk-backed state, and a continue-loop. Not for a single named task (just do it) or anything needing a human-only step first.
---

# Work-The-Plan: Orchestrated PLAN.md / TODO.md Runner

You are the orchestrator. Stay cheap and stay put: all reading/writing/debugging happens in disposable subagents; the only durable state is the checklist on disk. Do not delegate the loop itself, only per-task work.

```
SELECT -> TIER -> DISPATCH -> VERIFY -> RECORD -> CHECKPOINT -> repeat
```

Do not wait for re-invocation between iterations. Stop only per "When to stop".

## 1. SELECT

1. Pending items: `grep -n '^\s*- \[ \]' PLAN.md` (markers: `[ ]` pending, `[-]` in progress, `[x]` done, `[~]` blocked). Then `grep -n '^\s*- \[ \]' TODO.md` (repo root) when PLAN.md has nothing actionable. Also list `[~]` so you do not re-propose known blockers.
2. Read each candidate in context before picking. Skip (fix stale marker inline if trivial) anything that:
   - is already superseded or done per its own text;
   - needs a human: WORK `/exec` repoint (only `michael.hoffman@gsa.gov`), live-browser sign-in/MFA, IDE clicks, OAuth consent, anything labeled user-only or "Blocked on the user". Leave it `[ ]`/`[~]`.
3. Nothing actionable in either file: stop and report.
4. One task per iteration. Parallelize only tasks touching disjoint files whose outcomes cannot affect each other.

## 2. TIER

Per [[subagent-model-cost]] (always loaded): spawn `subagent_type: "lite" | "worker" | "deep"` (they pin model and
effort; never `general-purpose` with only a model while they exist). Tier agents missing → `general-purpose`
with an explicit `model` and the effort stated in the prompt. Cheapest tier expected to pass first time; state tier and a
one-line reason at each dispatch; retry one tier up ONLY when the exit test fails.

## 3. DISPATCH

Gather what the subagent needs first: file paths, line numbers, why, what was tried, what not to touch, and the
rules that apply by name (a fresh agent does not inherit your context). Never forward a raw bullet as the prompt.

Every prompt MUST contain:
- **Exit criteria**: the task-specific check, then `npm run lint && npm test`, with expected results. The agent
  reports evidence lines, not "done".
- **TDD** per [[test-before-fix]] and **fail loud** per [[fail-loud-catch]]. Not unit-testable → `tools/e2e/smoke-test.js`
  via `tools/ensure-chrome.js`, and say so.
- Constraints: no commit unless told; no `clasp push`; edit `.agents/` then `npm run sync:agents`, never the
  `.claude/`/`.kilo/` mirrors; never touch `gas-app/.clasp.json`; no `.toISOString()` on local dates; no `substr()`;
  browser checks only through `tools/ensure-chrome.js` + `tools/e2e/*`.

## 4. VERIFY (never trust a self-report)

- Re-run the exit commands yourself and read actual output: the specific `node --test tests/<file>.test.js`, then `npm run lint && npm test`.
- `git diff` the touched files: confirm they match the ask and nothing unrelated changed.
- Failure: retry once with sharper guidance, one tier up. Second failure: mark `[~]` with a dated one-line reason and move on.

## 5. RECORD (single writer: direct Edit)

- PLAN.md: flip the exact line `[ ]` -> `[x]`, or `[~]` with dated blocker reason, written `(blocked YYYY-MM-DD: reason)`.
  Deadlines on new items are `due YYYY-MM-DD` (see `.agents/rules/tracker-dates.md`).
- TODO.md: follow its existing conventions; completed items archive to `TODO_HISTORY.md` (and finished PLAN phases to `PLAN-HISTORY.md`) at handoff.
- Keep no running narrative; the checklist is the record. After context compaction, re-run the SELECT grep to rebuild state.

## 6. CHECKPOINT and gates

Per task, before commit: `npm run lint && npm test` green, zero warnings. Commit directly on the working branch ([[no-pr-theater]]): no PRs, no feature-branch dance, never `--no-verify`. Commit at least every 3 tasks. Do not push except at loop end or when asked.

GAS deploy gates:
- NEVER `clasp push` (or `npm run push:work`) a change that adds or alters OAuth scopes in `gas-app/appsscript.json` without explicit user approval. Stop and ask.
- Steps only the user can do (IDE clicks, Advanced Service enable, WORK repoint, trigger setup) are written for the user as `<file>:<fn>` (for example `gas-app/Code.gs:hubSpike`) with the exact action, and the task is left `[ ]` or `[~]`.
- Otherwise follow project memory for HOME deploys after a gas-app commit.

## When to stop

- Plan exhausted: report tally (done / blocked / skipped).
- Everything remaining needs the user: lead with the blocker and the specific unblocking action as `<file>:<fn>` steps.
- Circuit breaker: 2 consecutive tasks fail VERIFY after retry. Stop, report actual evidence, ask.
- User interrupts.

To survive a turn boundary, wrap with `/loop /work-the-plan`; otherwise continue inline.

## Status report (end of batch or on request)

```
Work-the-plan: <N> task(s)
done: <task> (tier, verified via <command>)
blocked: <task> (<reason>, matches [~] entry)
checkpoint: <sha> "<message>"
Remaining: <M> actionable, <K> blocked-on-user
Next: <next pick or "plan exhausted">
```
