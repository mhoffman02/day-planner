# GAS gotchas — generic, live-verified elsewhere

Project-specific traps live in the rules linked from `SKILL.md`; this file holds the
generic ones.

## 1. Scope minimization: ID-based opens cost the broad scope

Container-scoped calls (`getActiveSpreadsheet()`) can be covered by narrow `*.currentonly`
scopes because Apps Script verifies statically that they stay inside the container.
`SpreadsheetApp.openById(id)` and `DriveApp`-style ID lookups cannot be verified, so they
require the broad scope. Removing the call does not revoke an existing user grant: the
user must revoke in Google Account > Security > Third-party access and re-authorize.

## 2. Reading a live `doGet` response via browser automation is unreliable

Both `ContentService` JSON and `HtmlService` `<pre>` responses hung generic automation
readers (page-text, accessibility tree, screenshot) waiting for a document-idle state,
while the server-side work ran fine. Do not treat successful navigation as proof the body
is readable. Have the script write its result somewhere durable (Drive file, Script
Property, log) instead. For day-planner browser checks use the tooling in
[live-google-auth-browser-tool](../../../rules/live-google-auth-browser-tool.md).

## 3. `UrlFetchApp` URL length limit (~2KB)

Documented quota is a 2,048-char request URL. `encodeURIComponent` roughly triples the
size of quotes, commas and spaces, so a fixed "N IDs per request" chunk count is fragile
(`Exception: Limit Exceeded: URLFetch URL Length`). Build chunks by constructing the
candidate URL and measuring its real encoded length against a threshold (about 1900),
flushing when the next addition would exceed it.

## 4. A Drive connector "not found" is not "does not exist"

A connector authorized as a different Google identity than the file owner returns
"Requested entity was not found". Check which identity is authorized before concluding a
file is missing or inaccessible.

## 5. Verify method names

A hallucinated method (e.g. a plural setter that does not exist) throws
`TypeError: ... is not a function` only at runtime. Confirm against the reference page
and prefer what a live run accepts.
