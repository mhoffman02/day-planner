# No Pills — Flat UI Only

## The rule

Never introduce pill/capsule-shaped or fully-circular UI chrome
(`border-radius: 50%` or a radius that is half the element's height/width,
`border-radius: 999px`/`9999px`, or any hand-picked value that produces a
stadium shape) for buttons, badges, chips, toggles, or nav controls in this
app. That look is dated — this is a 2026 flat-UI product, not a 2010s-era
mobile app.

Use flat/ghost styling instead:
- Buttons/icon buttons: `background: transparent; border: none;` with a
  small `border-radius` (4–8px) and a subtle hover state
  (e.g. `background: rgba(255,255,255,0.12)` on dark surfaces), matching
  `.icon-nav-btn` / `.today-jump-btn` / `.search-trigger-compact` /
  `.sync-btn-compact` / `.theme-toggle-compact` in `gas-app/Styles.html`.
- Segmented nav/tabs: flat underline style, not a pill/segmented-control
  background — see `.segment-btn`.
- Status/category badges: small `border-radius` (3–4px) rounded-rect chips
  are fine (e.g. `.priority-badge`) — "no pills" means no stadium/circle
  shapes, not "no rounded corners at all."

## Why

The user explicitly rejected pill-shaped chrome throughout the header
(version badge, date-nav buttons, search/sync/theme toggle) in favor of a
flat, ghost-button 2026 aesthetic, and then generalized it: "No PILLS! This
is not 2000." Treat this as a standing constraint on all future UI work in
this app, not a one-off cleanup.

## How to apply

- Before adding or restyling any interactive control or badge, check its
  `border-radius` against its height — if it rounds to a full stadium or
  circle, flatten it to the ghost-button/rounded-rect pattern above.
- When doing UI work in this repo, proactively grep
  `gas-app/Styles.html`/`src/styles.css` for `border-radius: 50%` and
  suspiciously large radius values, and flag/flatten any found, even if not
  directly in scope for the task at hand.
- Applies to both `gas-app/Styles.html` (live) and `src/styles.css` (mirror)
  — see `[[sync-src-and-gas-app]]`.
