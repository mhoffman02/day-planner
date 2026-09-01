# Keep gh-pwa-shell/bundles.json in Sync with gas-app/

`gh-pwa-shell` (the public GitHub Pages loader at `mhoffman02.github.io/shell`, see
`[[shell-gas-pattern]]`) is offline-first: on every visit it mounts whatever is already cached
— IndexedDB first, falling back to `gh-pwa-shell/bundles.json` — before it does anything else.
`bundles.json` is not fetched live from the GAS app; it's a **build-time snapshot** of
`gas-app/Index.html` + `Styles.html` + `Script.html`, baked in by `tools/build-shell-bundle.js`.
If that snapshot goes stale, every shell visitor silently keeps seeing old UI — no error, no
warning, nothing to notice — until someone happens to compare screenshots.

## Required pattern

1. Change `gas-app/Index.html`, `Styles.html`, or `Script.html` as normal.
2. Run `npm run build:shell` — regenerates `gh-pwa-shell/bundles.json` from the current
   `gas-app/` state (also updates `gh-pwa-shell/pwa.js` if it still has a legacy inline
   `BUILTIN_BUNDLES` literal to migrate away from; normally a no-op there).
3. `npm run build:shell:check` (wired into `.githooks/pre-commit`) fails the `day-planner` commit
   if `gas-app/`'s content hash doesn't match the hash already baked into
   `gh-pwa-shell/bundles.json` — the enforcement mechanism, replacing manual "did I remember to
   rebuild the shell bundle" review, the same way `[[sync-src-and-gas-app]]`'s
   `build:gas:check` covers the five generated-engine files.
4. `gh-pwa-shell` is its own git repository (nested inside `day-planner/`, not a submodule) with
   its own remote and GitHub Pages deploy. The `day-planner` pre-commit hook can only verify the
   bundle is fresh on disk — it can't commit or push another repo for you. Commit and push
   `gh-pwa-shell`'s regenerated `bundles.json` separately, in the same work session as the
   `gas-app/` change that prompted it.

## Two different kinds of "fresh," two different mechanisms

- **`bundles.json` freshness** (this file) — same-origin, no CORS restriction. `pwa.js` can and
  does background-refetch `./bundles.json` after mounting the cached copy, compare its `hash` to
  what's cached, and silently swap in an updated bundle with a lightweight "Update ready" banner
  (see `checkForFreshBundle()` in `pwa.js`). `sw.js` serves `bundles.json` network-first
  (falling back to cache offline) specifically so that background check can actually see a
  change the same day it's deployed, not just after the next `CACHE_NAME` bump.
- **Live GAS app freshness** — cross-origin (`script.google.com` / `*.googleusercontent.com`).
  Google's edge auth redirect blocks background `fetch`/iframe access from a different origin
  (see `shell-gas-pattern.md` §9), so there is no way to silently check "is the live app newer."
  That's why "Go live" (`showGoLiveBanner`/`redirectToApp` in `pwa.js`) is a manual, explicit
  top-level navigation instead — it is not the same mechanism as the bundle-freshness check
  above and does not benefit from `npm run build:shell`.

## Why

If only `gas-app/` is updated, `npm test` and `npm run build:gas:check` both stay green while
the public shell — the only way most users ever launch this app, and the thing the "Get the
App" install link in `About.html` points at — keeps serving a stale snapshot. `build:shell:check`
closes that gap for the day-planner side; remembering to actually commit+push the regenerated
`gh-pwa-shell/bundles.json` is still a manual step (it's a separate repo the hook can't reach),
so treat "did I push gh-pwa-shell" as part of finishing any `gas-app` UI change, not an
afterthought.
