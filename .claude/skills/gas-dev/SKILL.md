---
name: gas-dev
description: Google Apps Script (GAS) development reference - service index, HtmlService/ContentService, web-app (doGet/doPost, google.script.run) and ScriptApp trigger patterns, architecture/performance patterns, and generic gotchas, plus pointers to this repo's GAS rules. Use when writing or debugging any gas-app/*.gs file, doGet/doPost entry point, HtmlService page, or ScriptApp trigger.
---

# gas-dev

MUST: load before writing or modifying any `.gs` file, `doGet`/`doPost`, `HtmlService`/`ContentService` response, or `ScriptApp` trigger.
MUST: read `reference/gotchas.md` before assuming a GAS API behaves as it "should".
MUST NOT: invent GAS method names or signatures. Verify at `https://developers.google.com/apps-script/reference/<service>`; if the live docs disagree with these files, trust the live docs.

## This repo's GAS rules (these win over anything in `reference/`)

- [gas-namespace-iife](../../rules/gas-namespace-iife.md): IIFE per `.gs` file, export surface, top-level delegators.
- [gas-global-init-order](../../rules/gas-global-init-order.md): no global variables; shared values live in frozen IIFE namespace objects behind getters/setters (clasp pushes alphabetically).
- [gas-html-safe-chars](../../rules/gas-html-safe-chars.md): no literal `//`, backticks or apostrophes in `gas-app/*.html` strings/comments.
- [gas-environments](../../rules/gas-environments.md): HOME vs WORK scripts, dev/exec endpoints.
- [fail-loud-catch](../../rules/fail-loud-catch.md): every catch logs or rethrows.
- [live-google-auth-browser-tool](../../rules/live-google-auth-browser-tool.md): browser checks go through `tools/ensure-chrome.js`.

## This project

- HOME is the mastercopy (`gas-app/.clasp.json`); deploy with `clasp push --force` from `gas-app/`. Never retarget `.clasp.json` to WORK.
- Advanced Services only: no `GmailApp`, no `DocumentApp`. Docs, Sheets and Gmail go through Advanced Services under `drive.file` / `gmail.readonly`. A new Advanced Service also needs enabling in the IDE Services panel.
- No `userinfo.email` scope: never use `Session.getActiveUser()`; get the email from the Gmail profile.
- Anything reachable from `google.script.run`, `doGet`, `onOpen`, a trigger name string, or the IDE run dropdown needs a top-level delegator in `Code.gs` (not only the `global._xInternal` alias).
- IDE-runnable functions are named `<file>:<fn>` (e.g. `UnitTests:testDoGetInIDE`).
- Before committing: `npm run lint && npm test`.

## Looking up an uncovered API

Delegate the fetch to `tools/gemini-delegate.js` (see the `gemini-delegate` skill):

```bash
node tools/gemini-delegate.js --force --raw \
  --task "Fetch https://developers.google.com/apps-script/reference/<svc>/<class> and list every method whose name contains '<x>' with exact signature, return type, one-line description. If you cannot access the web, reply exactly: NO_WEB_ACCESS"
```

- Always pass `--force` and the `NO_WEB_ACCESS` escape clause; scope to one URL and one question.
- A returned method name is a claim, not evidence: confirm it on the cited page before coding against it. Delegate only the lookup, never the edit or the API choice.

## Index

| File | Covers |
|---|---|
| `reference/service-index.md` | Every GAS service with description and reference URL |
| `reference/html-service.md` | HtmlService, HtmlOutput, HtmlTemplate, scriptlets, `include()`, sandbox |
| `reference/content-service.md` | ContentService, TextOutput, MimeType, JSON vs HTML responses |
| `reference/web-app-patterns.md` | doGet/doPost event objects, `google.script.run`, `/exec` vs `/dev`, manifest `webapp` settings, CORS |
| `reference/triggers.md` | ScriptApp trigger builders, one-shot trigger with self-delete |
| `reference/gotchas.md` | Scope minimization, automation reading doGet, URL length, identity mismatches |
| `reference/v8-guide-patterns.md` | Architecture/performance patterns: adopt, skip, or superseded here |
