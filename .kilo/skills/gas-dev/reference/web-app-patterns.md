# Web-app patterns — doGet/doPost, google.script.run, deployment

Source: Gemini-drafted (via `tools/gemini-delegate.js`, GAS-expert
knowledge), reviewed 2026-09-19. Method names cross-checked against the
live-fetched `html`/`content`/`script` reference pages where they
overlap; the deployment-model and `google.script.run` sections below are
not independently re-verified against a live fetch — treat as
high-confidence but not ground-truth the way `html-service.md`/
`content-service.md` are.

## `doGet(e)` / `doPost(e)` event object

```javascript
function doGet(e) {
  // e.queryString   — "name=alice&tag=gas" (raw string)
  // e.parameter     — { name: "alice", tag: "gas" }   (first value per key)
  // e.parameters    — { name: ["alice"], tag: ["gas"] } (all values per key)
  // e.pathInfo      — extra path segments after the deployment URL, if any
  // e.contextPath   — usually empty
}

function doPost(e) {
  // All of the above (if query params were also in the POST URL), plus:
  // e.postData.length   — body byte length
  // e.postData.type     — body MIME type, e.g. "application/json"
  // e.postData.contents — raw body string (JSON.parse it yourself)
}
```

`doGet` never sees a request body — only query params. There is no
`doPut`/`doDelete`/`doPatch`; a GAS web app only ever receives `GET` or
`POST`. Route everything else through `doPost` with a body field
indicating the intended verb, if you need REST-like semantics.

## `google.script.run` — the client↔server bridge

Available automatically to client-side `<script>` code inside an
`HtmlService` page (not from an external site, and not from a plain
`<script src="...">` pointed outside the served page).

```javascript
google.script.run
  .withSuccessHandler(function (result) { /* ... */ })
  .withFailureHandler(function (error) { /* ... */ })
  .withUserObject({ any: 'context' })   // optional, passed through to handlers
  .myServerFunction(arg1, arg2);        // calls a global function in a .gs file
```

Constraints:
- **Async only.** No return value, no `await` — you cannot write
  `var x = google.script.run.foo()`. Everything happens through the
  success/failure handlers.
- **JSON-serialized arguments/return values.** Primitives, plain
  objects, and arrays only. No `Date` objects (convert to ISO string or
  epoch ms yourself), no functions, no DOM nodes, no `Blob`, no circular
  references.
- Put `<base target="_top">` in the page `<head>` so form submissions
  and links navigate the real window instead of failing inside the
  sandboxed serving iframe.

## Deployment model

- **`/exec` (production URL):** pinned to whichever version was last
  published as a deployment. Editing and saving code in the editor does
  **not** change what `/exec` serves until you create/update a
  deployment.
- **`/dev` (head/test-deployment URL):** always serves the latest saved
  code, no publish step needed. Only reachable by users with edit access
  to the script project (see `webapp.access` below — `/dev` additionally
  requires project-edit permission regardless of the `access` setting).
- The `/dev` URL is stable for the life of the project; it does not
  rotate between `clasp push`es. `/dev` only works with the `@HEAD`
  deployment ID, never a versioned one; `/exec` needs a versioned ID.

## `appsscript.json` manifest — `webapp.access` / `webapp.executeAs`

```json
{
  "webapp": {
    "access": "MYSELF",
    "executeAs": "USER_DEPLOYING"
  }
}
```

`access` (who can reach the web app at all):
- `MYSELF` — only the script owner/deployer.
- `DOMAIN` — anyone in the same Workspace domain.
- `ANYONE` — any signed-in Google account.
- `ANYONE_ANONYMOUS` — fully public, no sign-in.

`executeAs` (whose Google identity/quota the script runs under):
- `USER_DEPLOYING` — always runs as the developer who deployed it,
  regardless of who's visiting. Visitors need no Google permissions of
  their own for Drive/Sheets/etc. the script touches. Required if
  `access` is `ANYONE_ANONYMOUS` (an anonymous visitor has no identity
  to execute as).
- `USER_ACCESSING` — runs as the visiting user; they must authorize the
  script's scopes themselves. Incompatible with `ANYONE_ANONYMOUS`.

## CORS and `UrlFetchApp`

Client-side `fetch()`/`XMLHttpRequest` from inside an `HtmlService` page
is subject to normal browser CORS rules. `UrlFetchApp.fetch()` runs
server-side inside the Apps Script runtime and is **not** subject to
browser CORS — that's the standard way to reach an API that doesn't
send CORS headers: proxy the call through a server-side function via
`google.script.run` → `UrlFetchApp.fetch()`, rather than calling it
directly from client JS.
