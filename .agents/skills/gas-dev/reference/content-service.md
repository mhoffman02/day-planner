# ContentService — deep reference

Source: live-fetched `developers.google.com/apps-script/reference/content`
(2026-09-19).

## ContentService (top-level factory)

| Method | Returns | Notes |
|---|---|---|
| `createTextOutput()` | `TextOutput` | Empty. |
| `createTextOutput(String content)` | `TextOutput` | Pre-filled. |
| `ContentService.MimeType` | enum | `CSV`, `ICAL`, `JAVASCRIPT`, `JSON`, `TEXT`, `VCARD`. **No `HTML` value** — HTML responses must go through `HtmlService`, never `ContentService`, by design. |

## TextOutput

| Method | Params | Returns | Notes |
|---|---|---|---|
| `setContent` | `String` | `TextOutput` | Replaces content. |
| `append` | `String` | `TextOutput` | Concatenates. |
| `clear` | — | `TextOutput` | |
| `getContent` | — | `String` | |
| `setMimeType` | `MimeType` | `TextOutput` | |
| `getMimeType` | — | `MimeType` | |
| `downloadAsFile` | `String filename` | `TextOutput` | Forces the browser to download instead of rendering inline. |
| `getFileName` | — | `String` | Null if `downloadAsFile` was never called. |

## `ContentService` vs `HtmlService` — which to return from `doGet`/`doPost`

| | `ContentService.TextOutput` | `HtmlService.HtmlOutput` |
|---|---|---|
| Use for | JSON/CSV/plain-text APIs, webhooks, programmatic consumers | Human-facing browser UI |
| Client-side JS | None — pure payload | `google.script.run` bridge available |
| Typical pattern | `ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON)` | `HtmlService.createTemplateFromFile('Index').evaluate()` |

Reading a live `doGet` response back through browser automation is unreliable for both services; see `gotchas.md` #2.
