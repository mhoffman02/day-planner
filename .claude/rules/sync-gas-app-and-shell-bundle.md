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

## Nested checkout is now self-healing (`tools/sync-shell-repo.js`)

A worktree or fresh clone of `day-planner` doesn't carry `gh-pwa-shell/` — it's a plain nested
directory, not a submodule, so `git worktree add` and `git clone` never bring it along. That used
to make step 3's check a **silent no-op**: `build:shell:check` printed
`"gh-pwa-shell/ checkout not present here — nothing to check."` and exited 0, so a worktree commit
could ship stale UI to the public shell with a clean pre-commit run.

`tools/build-shell-bundle.js` now calls `ensureShellRepo()` (`tools/sync-shell-repo.js`) as its
first step, every run — both plain `npm run build:shell` and the `--check` pre-commit gate. It
clones `gh-pwa-shell` from its remote if the directory is missing, or fast-forward pulls it if
present, before anything else happens. This means:

- The pre-commit gate is now a **real check in every worktree**, not just the main checkout — a
  stale bundle actually blocks the commit instead of silently passing.
- You no longer need to manually `cp` or clone `gh-pwa-shell` into a worktree before running
  `npm run build:shell` there.
- It's best-effort and never throws: a clone/pull failure (no network, auth) is logged as a
  warning and the check falls back to the old no-op behavior rather than blocking on
  infrastructure it can't control. A dirty `gh-pwa-shell` working tree (uncommitted local
  changes) skips the pull and checks against whatever's on disk.
- Committing and pushing `gh-pwa-shell`'s regenerated `bundles.json` in its own repo (step 4
  above) is still a separate, unautomated step — this only makes the *checkout* and the
  *staleness check* automatic, not the commit/push.

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
