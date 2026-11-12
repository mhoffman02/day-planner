# No Pills: Flat UI Only

User: "No PILLS! This is not 2000."

- No pill/stadium/circle chrome (`border-radius: 50%`, `999px`/`9999px`, any radius rounding a control to a stadium) on buttons, badges, chips, toggles, nav.
- Buttons: transparent, no border, 4-8px radius, subtle hover (`.icon-nav-btn`, `.today-jump-btn`, `.sync-btn-compact`). Tabs: flat underline (`.segment-btn`). Badges: 3-4px radius rect (`.priority-badge`).
- Before styling any control or badge, check radius vs height; flatten if it rounds to a stadium/circle.
- Any UI work: grep `src/styles.css` for `border-radius: 50%` and oversized radii; flatten finds even out of scope.
