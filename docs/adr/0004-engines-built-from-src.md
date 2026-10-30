# 0004 Server engines are built from tested `src/integration`

**Status:** Accepted (Phase 28 hub work).

**Context:** Hub logic (classification, routing, ledger, planners) must run on GAS and be unit-tested in
Node. Hand-copied logic drifts.

**Decision:** Pure ES modules in `src/integration/*.js` are the source. `tools/build-gas-engines.js`
concatenates them into one IIFE, `DPEngines`, in `gas-app/Engines.gs`. `npm run lint` runs
`build-gas-engines --check`, so a stale Engines.gs cannot be committed. The modules use no Google services
and no `Date.now`.

**Consequences:** Google service calls live in the repository `.gs` files (functional core, imperative
shell). Top-level names must be unique across `src/integration`. The client Script.html still mirrors
some `src/*.js` code by hand; tests run both copies where they exist.
