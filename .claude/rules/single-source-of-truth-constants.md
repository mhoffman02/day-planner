# Single Source of Truth for Cross-File Constants — No Duplicated Magic Values

## The rule

When the same conceptual value — a version tag, a cache name, an ID, a URL
pattern, a timeout — must be known by **more than one file or runtime
context**, it must be defined in exactly one place and referenced everywhere
else, never hand-copied as a second literal that has to be kept in sync by
memory.

This is not a blanket ban on numeric or string literals. A value used exactly
once, in one obvious place (a CSS `border-radius: 6px`, a one-off timeout
constant local to the function that uses it) does not need to be extracted —
see `CLAUDE.md`'s own anti-overengineering guidance: don't add abstraction
the task doesn't need. The trigger for this rule is specifically
**duplication across files or execution contexts**, where nothing but a
comment and human memory enforces that the copies stay equal.

Concretely in this repo:

- `gh-pwa-shell/version.js` is the single source of truth for the shell
  build's version tag (`SHELL_VERSION`). `sw.js` derives `CACHE_NAME` from it
  via `importScripts('./version.js')` (a service worker can't share an ES
  module scope with the page, so this is the mechanism, not an ES `import`).
  `index.html` loads the same file via a plain `<script src="./version.js">`
  tag before `pwa.js`, and `pwa.js` writes it into the `#shell-version` DOM
  node at runtime — the HTML markup itself carries no version literal.
- The pinned GAS deployment ID / `/exec` URL lives in exactly one place
  already (`gh-pwa-shell/pwa.js`'s `KNOWN_APPS`) and is referenced elsewhere
  only in docs (`CLAUDE.md`, `.agents/rules/gas-deploy-pinned.md`) — that's
  fine, since docs aren't a second *executable* copy that can silently drift
  out of sync and break something.
- `tools/build-shell-bundle.js`'s `version = '1.3.0'` is the Day Planner app
  bundle's own version, used in exactly one file to compute `bundles.json`'s
  hash — not duplicated elsewhere, so it does not need extraction under this
  rule.

## Why

`gh-pwa-shell/index.html`'s `#shell-version` build-tag label and `sw.js`'s
`CACHE_NAME` used to be two independent hardcoded strings with only an
in-file comment ("bump alongside sw.js's CACHE_NAME whenever...") holding
them in sync. A `/code-review` pass caught them silently drifting (`Shell
v17` label next to a `CACHE_NAME` already bumped to `v18`) — the exact
failure mode this rule exists to make structurally impossible instead of
comment-enforced.

## How to apply

- Before hardcoding a version/ID/URL/pattern literal, check whether the same
  value needs to be known by another file or a different runtime context
  (page vs. service worker, client vs. build script). If yes, put it in one
  module and have every consumer read from there — never copy the literal a
  second time.
- This applies equally to `gas-app/`↔`src/` parity (see
  `[[sync-src-and-gas-app]]`) and `gas-app/`↔`gh-pwa-shell` bundle parity
  (see `[[sync-gas-app-and-shell-bundle]]`) — those rules cover keeping
  *generated* content in sync via build scripts; this rule covers hand-authored
  constants that have no build step to regenerate them, so the only fix is a
  shared definition.
- Don't over-apply this to single-use literals — see the scoping note above.
  The question is always "does another file/context need this same value,"
  not "is this a bare number."
