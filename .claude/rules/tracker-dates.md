# Tracker Dates (TODO.md, PLAN.md, HANDOFF.md)

- Open-item deadline: `due YYYY-MM-DD`.
- Any other date (added, verified, shipped, blocked): `(YYYY-MM-DD)` or `verified YYYY-MM-DD`; never preceded by due/by/on/before/until/expires/deadline/next.
- Passed deadline: rewrite as `OVERDUE (was due YYYY-MM-DD)` + its first agent action.
- Dates are local (`date +%F`), never UTC.

Enforced: `npm run check:handoff` (`DUE_RE` in `tools/check-handoff.js`) keys on the word before the date.
**Why:** 2026-10-22 an expiry written "(2026-10-17)" read as an added date; the overdue was missed.
