# Tracker Dates: Deadlines Say "due"

Applies to every edit of `TODO.md`, `PLAN.md` and `HANDOFF.md`, by any skill, command or ad-hoc session.

- A deadline on an open item: write `due YYYY-MM-DD` (e.g. "rpc token expires, due 2026-10-24").
- Any other date (added, verified, shipped, blocked): write `(YYYY-MM-DD)` or `verified YYYY-MM-DD`. MUST NOT put
  "due", "by", "on", "before", "until", "expires", "deadline" or "next" right before it.
- A deadline that has passed: rewrite the item as `OVERDUE (was due YYYY-MM-DD)` and name its first agent action.
- Dates are local (`date +%F`), never UTC.

Enforced by `npm run check:handoff` (`tools/check-handoff.js`, `DUE_RE`): a keyword before a past date on an open
item is reported as overdue; a date without one is ignored.

**Why:** on 2026-10-22 an expiry written as "(2026-10-17)" read like an "added" date, so the handoff missed that it
was overdue. A script can only tell a deadline from a note by the word before it.
