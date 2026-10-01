# Resume: Version History fixed on HOME; WORK needs a new version + repoint

**Start by:** Ask the user whether `michael.hoffman@gsa.gov` has repointed WORK `/exec` to
Version 127 (pushed 2026-10-01, includes Build 374). No independent agent work is queued.

This session fixed the Notes "Version History" button (formerly "Note Version History (Time
Machine)"), which did nothing when clicked: the modal card's `@click.away` caught the opening
click and closed the dialog instantly. Removed it (backdrop close still works via `@click.self`)
and renamed the labels in `gas-app/Index.html`, `index.html`, and `gas-app/About.html`. Live on
HOME `/dev` and pinned prod `@292`; user confirmed fixed.

- What changed — `TODO_HISTORY.md`'s "2026-10-01 — Version History Button Fixed & Renamed" entry
- Still open — `TODO.md` Phase 25:
  - Repoint WORK `/exec` to Version 127 — user-blocked (`michael.hoffman@gsa.gov` only, WORK IDE → Deploy → Manage deployments)
- Note: the main checkout's local `pure-gas-main` is behind `origin` — `git pull` before working there.
