# Resume: Version History fixed on HOME; WORK needs a new version + repoint

**Start by:** Run `npm run push:work` to create a new WORK version containing Build 374 (commit
`ecdc1d5`, the Version History modal fix) — WORK Version 125 predates it.

This session fixed the Notes "Version History" button (formerly "Note Version History (Time
Machine)"), which did nothing when clicked: the modal card's `@click.away` caught the opening
click and closed the dialog instantly. Removed it (backdrop close still works via `@click.self`)
and renamed the labels in `gas-app/Index.html`, `index.html`, and `gas-app/About.html`. Live on
HOME `/dev` and pinned prod `@292`; user confirmed fixed.

- What changed — `TODO_HISTORY.md`'s "2026-10-01 — Version History Button Fixed & Renamed" entry
- Still open — `TODO.md` Phase 25:
  - (Next) Promote Build 374 to WORK via `npm run push:work`
  - Repoint WORK `/exec` to that new version — user-blocked (`michael.hoffman@gsa.gov` only, WORK IDE → Deploy → Manage deployments)
- Note: the main checkout's local `pure-gas-main` is behind `origin` — `git pull` before working there.
