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
