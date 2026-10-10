# Architecture and performance patterns (filtered)

Curated from a personal GAS V8 developer guide. Quota numbers are best recollection;
verify against current Google docs before relying on them.

## Adopt

- **Trigger-driven deferred work with self-cleanup.** See `triggers.md`.
- **Exponential-backoff retry for `UrlFetchApp`**, with jitter if retries may collide.
- **Server-side error boundary.** Validate inputs early, log full detail server-side, return
  a sanitized error to the client. (This repo additionally requires every catch to fail
  loud; see [fail-loud-catch](../../../rules/fail-loud-catch.md).)
- **Response envelope** `{success, data, error, timestamp}` for `google.script.run` or
  `ContentService` endpoints once the surface grows past a few ad hoc actions.
- **Execution-scoped memoization** for repeated reads within one run.
- **`CacheService`** for cross-invocation caching (TTL up to 6 hours, 100KB per entry).
- **Batch reads and writes** (one `getValues`/`setValues`, one Docs/Calendar batch call)
  instead of per-item service calls inside loops.

## Overkill for a small project

- Two-tier memory plus `CacheService` with LRU and metrics.
- Time-budget checkpointing with resumable state (only for multi-thousand-row jobs; the
  limit is 6 minutes per execution).
- `PropertiesService` chunking across `key_0`/`key_1`; use a Drive file instead.
- Semver guards, dependency resolution, service registries, multi-stage deploy pipelines
  (library-scale concerns).
- Monkey-patching globals for tests; prefer pure-logic functions tested in Node and
  GAS-runtime checks via the in-repo self-test.

## Superseded or contradicted by this repo

- **Class-based modules and "const Foo = IIFE" namespaces.** This repo wraps each `.gs`
  file in `(function(global){ ... })(this);` with explicit exports; see
  [gas-namespace-iife](../../../rules/gas-namespace-iife.md).
- **"Trailing underscore = private" as access control.** In the source guide a name without
  `_` is public via `google.script.run`. Here, reachability is controlled by the IIFE
  export surface plus top-level delegators, not naming; the underscore is style only.
- **Pure.css/USWDS UI stack.** Not applicable; this app follows the binder aesthetic in
  CLAUDE.md.
