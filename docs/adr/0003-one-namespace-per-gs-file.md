# 0003 No globals: one frozen IIFE namespace per `.gs` file

**Status:** Accepted 2026-10-10.

**Context:** clasp pushes `gas-app/*.gs` in alphabetical order and GAS evaluates them in that order, so a
top-level value read by an earlier file is still undefined. Bugs from this only show at runtime on GAS.

**Decision:** Each `.gs` file exposes one frozen namespace object built by an IIFE; shared values sit
behind getters. A function called through `google.script.run` also needs a top-level delegator in
`Code.gs`.

**Consequences:** Load order no longer matters. Callers write `DPQueue.x()` rather than `x()`. Engines.gs
follows the same pattern (`DPEngines`, see [0004](0004-engines-built-from-src.md)).
