# 0005 JavaScript + `v_` boundary validation, not TypeScript

**Status:** Accepted 2026-10-30 (user decision 3F). Library under review: `docs/v_-review.md`.

**Context:** Types catch bad data early (Maguire). GAS must receive plain JavaScript and Script.html is
served as-is, so TypeScript adds a compile step between tested source and what runs. JSDoc `@param`
comments document types but enforce nothing and drift from the code.

**Decision:** Exported module functions (boundaries) declare parameters with the fluent `v_` validator,
which replaces the JSDoc `@param` header and throws a `ValidationError` on the first bad argument. It also
sanitizes (trim, default, explicit coercion). Module internals stay unchecked. Return values are declared
with `.returns(spec)` and asserted by unit tests against the same spec; they are enforced at runtime only
at trust boundaries (RPC responses).

**Consequences:** Type errors surface at the boundary, at runtime and in tests, not at compile time. One
spec serves as docs, runtime check and test contract. Each call pays a small validation cost, so `v_` is
not used in hot internal loops.

**Addendum (2026-11-01), RPC boundaries:** validation is uniform: every `google.script.run` entry point guards
its arguments first through `v_`. Error transport stays per family and is never mixed within one: Code.gs RPCs
throw the `ValidationError`; hub RPCs (`HubController.gs`, `rejectInvalid_`) return the `makeResult` envelope
`{ok:false, errorCode:'INVALID_INPUT'}` and never throw; friendly RPCs (`resolveDriveFileTitle`,
`pullDictationScratchText`, `validateAndSaveFolderUrl`; `friendlyInvalid_`) return their own
`{success:false, error}` shape. Both wrappers catch only `ValidationError` and rethrow everything else.
`rpc-guard-baseline.json` is now `[]`; `tools/check-rpc-guards.js` fails any new unguarded RPC.
