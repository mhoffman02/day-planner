# No Pills — Flat UI Only

- MUST NOT use pill/capsule or fully-circular UI chrome (`border-radius: 50%`, `border-radius: 999px`/`9999px`, or any radius that rounds a control into a stadium shape) for buttons, badges, chips, toggles, or nav controls.
- Buttons/icon buttons: transparent background, no border, small `border-radius` (4-8px), subtle hover state — see `.icon-nav-btn`, `.today-jump-btn`, `.search-trigger-compact`, `.sync-btn-compact`, `.theme-toggle-compact` in `src/styles.css`.
- Segmented nav/tabs: flat underline style, not a pill/segmented-control background — see `.segment-btn`.
- Status/category badges: small `border-radius` (3-4px) rounded-rect chips are fine — see `.priority-badge`. "No pills" bans stadium/circle shapes, not rounded corners generally.
- Before adding or restyling any interactive control or badge: MUST check its `border-radius` against its height — if it rounds to a full stadium or circle, flatten it.
- When doing any UI work in this repo: MUST grep `src/styles.css` for `border-radius: 50%` and suspiciously large radius values, and flatten any found, even outside the task's stated scope.

**Why:** the user explicitly rejected pill-shaped chrome ("No PILLS! This is not 2000") — standing constraint on all UI work, not a one-off cleanup.
