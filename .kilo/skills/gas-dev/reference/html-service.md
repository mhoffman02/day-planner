# HtmlService — deep reference

Source: live-fetched `developers.google.com/apps-script/reference/html`
(2026-09-19) + Gemini-drafted pattern notes, reviewed before inclusion.

## HtmlService (top-level factory)

| Method | Returns | Notes |
|---|---|---|
| `createHtmlOutput()` | `HtmlOutput` | Empty output. |
| `createHtmlOutput(String html)` | `HtmlOutput` | From a literal string. |
| `createHtmlOutput(BlobSource blob)` | `HtmlOutput` | From a Blob. |
| `createHtmlOutputFromFile(String filename)` | `HtmlOutput` | Loads an `.html` project file verbatim (no templating). |
| `createTemplate(String html)` | `HtmlTemplate` | Scriptlet-aware, from a string. |
| `createTemplate(BlobSource blob)` | `HtmlTemplate` | Scriptlet-aware, from a Blob. |
| `createTemplateFromFile(String filename)` | `HtmlTemplate` | Scriptlet-aware, loads an `.html` project file. Most common web-app pattern. |
| `getUserAgent()` | `String` | Current requester's browser UA string. |

Enums: `HtmlService.SandboxMode` (`EMULATED`, `NATIVE`, `IFRAME` —
**legacy, see Gotchas below**), `HtmlService.XFrameOptionsMode`
(`DEFAULT`, `ALLOWALL`).

## HtmlOutput

| Method | Returns | Notes |
|---|---|---|
| `setContent(String)` | `HtmlOutput` | Replaces entire content. |
| `append(String)` | `HtmlOutput` | Appends with sanitization. |
| `appendUntrusted(String)` | `HtmlOutput` | Appends with contextual escaping — still not a free pass for raw untrusted HTML; understand what "contextual" covers before relying on it for user input. |
| `clear()` | `HtmlOutput` | Removes all content. |
| `getContent()` | `String` | Current content. |
| `asTemplate()` | `HtmlTemplate` | Converts back to a template. |
| `addMetaTag(name, content)` | `HtmlOutput` | Adds a `<meta>` tag. |
| `getMetaTags()` | `HtmlOutputMetaTag[]` | |
| `setFaviconUrl(url)` / `getFaviconUrl()` | `HtmlOutput` / `String` | |
| `setTitle(title)` / `getTitle()` | `HtmlOutput` / `String` | Browser tab title. |
| `setWidth(px)` / `getWidth()` | `HtmlOutput` / `Integer` | **Dialog/sidebar sizing only** — no effect on a `doGet` web-app response. |
| `setHeight(px)` / `getHeight()` | `HtmlOutput` / `Integer` | Same caveat. |
| `setSandboxMode(mode)` | `HtmlOutput` | **No longer has any effect** — kept only for old-code compatibility. See Gotchas. |
| `setXFrameOptionsMode(mode)` | `HtmlOutput` | Controls clickjacking protection header. `ALLOWALL` lets the page be iframed by other sites — only use it deliberately. |
| `getBlob()` | `Blob` | |
| `getAs(contentType)` | `Blob` | |

## HtmlTemplate

| Method | Returns | Notes |
|---|---|---|
| `evaluate()` | `HtmlOutput` | Runs the scriptlets, returns real output — this is the call that actually executes your `<? ?>`/`<?= ?>` code. |
| `getCode()` | `String` | Generated JS for the template (debugging aid). |
| `getCodeWithComments()` | `String` | Same, with original template lines as comments. |
| `getRawContent()` | `String` | Unprocessed template source. |

## Scriptlet syntax (inside a template file)

- `<?= expression ?>` — **printing, escaped**. Evaluates JS, HTML-escapes
  the result. Default choice for any user-supplied or dynamic data.
- `<?!= expression ?>` — **printing, unescaped/raw**. Injects raw
  HTML/JS. Only for trusted content you control (partial includes,
  server-generated markup) — never for anything derived from user input.
- `<? statement ?>` — **control-flow**, no output. Loops, conditionals,
  variable assignment.

```html
<h3>Welcome, <?= user.name ?></h3>
<? if (user.roles.includes('admin')) { ?>
  <p>Admin panel access granted.</p>
<? } ?>
<? for (var i = 0; i < items.length; i++) { ?>
  <li><?= items[i] ?></li>
<? } ?>
```

## The `include()` partial pattern

Apps Script has no native `<script src="...">`/`<link href="...">` to
another project file. The standard workaround:

```javascript
// Code.gs
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate();
}
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
```

```html
<!-- Index.html -->
<head>
  <base target="_top">
  <?!= include('Stylesheet'); ?>
</head>
<body>
  <?!= include('JavaScript'); ?>
</body>
```

`<?!=`, not `<?=`, is mandatory here — escaping would turn the included
HTML/JS into visible text instead of live markup.

## Sandbox modes — legacy, don't rely on `SandboxMode`

`SandboxMode.NATIVE`/`EMULATED` (the old Caja-based sandboxing) are
retired; all HtmlService content now runs in `IFRAME` mode regardless of
what `setSandboxMode()` is called with. Don't write new code that
branches on sandbox mode — there's only one mode now.
