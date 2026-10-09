<!-- handoff: branch=feat/gmail-meeting-hub worktree=/home/mike/projects/day-planner/.claude/worktrees/today-hover-zoom base=11ab231c12a8 written=2026-10-09T14:02:08-07:00 -->
# Resume: Gmail/Meeting hub is built and merged; next is the user-gated push to HOME

**Start by:** ask the user to approve the first `clasp push` to HOME (it carries `gmail.readonly` and forces re-consent), then walk them through steps L1-L10 in [`docs/hub-setup-and-gate.md`](file:///home/mike/projects/day-planner/docs/hub-setup-and-gate.md). Do not push without that approval.

## OBJECTIVE
Phase 28 turns Day Planner into a workflow hub: Gmail triage to Google Tasks, recurring-meeting prep from Calendar, app-owned meeting-notes Docs, and (later) Gemini/human-note reconciliation. Code is complete and tested locally; nothing has run on Google yet.

## KEY DECISIONS
- Gmail is read-only (`gmail.readonly`, Advanced Gmail service). `GmailApp` is lint-banned. The user applies labels by hand, prefix `🎯/`.
- Config, Meeting Registry and Integration Ledger live in an app-created Sheet. Flags default OFF, `DRY_RUN` ON (flags are cached in the `HUB_FLAGS_JSON` UserProperty).
- Logic lives in pure `src/integration/*.js` engines, built into `gas-app/Engines.gs` by `tools/build-gas-engines.js` (`--check` is a gate). `.gs` wrappers stay thin.
- Idempotency: ledger op keys such as `GMAIL|<threadId>|TASK`, also embedded in task notes via dp-meta.
- Notes Doc is app-owned (`Meeting Notes - <Series>`); Waiting = Task plus `[Waiting]` tag.
- User rule: no silent failures. Every `catch` in `gas-app/*.gs` now logs `console.error` (commits `368b36e`, `11ab231`).

## CURRENT STATE
- Branch `feat/gmail-meeting-hub`, merged into `pure-gas-main` by fast-forward (it already contained the hover/zoom fix `f641dc3`).
- Lint clean, 483/483 tests pass, `Engines.gs` in sync. Nothing pushed to a remote or to clasp.
- Unverified: Sheets under `drive.file` (needs the live spike). Phase 6 is only parser plus interface; Phase 7 not built.

## CONSTRAINTS & PREFERENCES
- Terse replies, start with `🔋Mike:`; commit directly, no PR theater; "I abhor silent failures".
- Q8 gate: STOP before any `clasp push` carrying the new scope until the user approves. HOME is mastercopy; WORK only via `npm run push:work`.
- Browser checks only via `tools/ensure-chrome.js` + `tools/e2e/*`. Close any open IDE editor tab before a push. No pills; GAS HTML files must not contain `//`, apostrophes or backticks in strings or comments.
- Use the `haiku` alias for light subagent work (user wants "Haiku 5.5", exact ID unverified).

## OPEN THREADS (THE 3 MOST IMPORTANT TASKS)
1. Push gate + IDE Services (+) for Gmail and Sheets on HOME ([`TODO.md`](file:///home/mike/projects/day-planner/TODO.md) lines 14-19).
2. Live HOME spike: Sheets under `drive.file`, emoji label resolution, DRY_RUN smoke; seed 2-3 threads ([`docs/hub-setup-and-gate.md`](file:///home/mike/projects/day-planner/docs/hub-setup-and-gate.md)).
3. WORK: repoint to the latest version (user only), and `npm run push:work` for the hub after HOME passes.

## IMMEDIATE NEXT STEP
Ask the user: "Approve the first `clasp push` to HOME carrying `gmail.readonly`?" If yes, close the IDE editor tab, then `cd gas-app && clasp push --force`.
Housekeeping after the merge: remove the `today-hover-zoom` worktree and the stale `agent-*` worktrees and `feat/gmail-hub-*` branches.
