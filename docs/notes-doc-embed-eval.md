# Notes panel: viewing a slice of the monthly notes Doc in place

Date: 2026-10-30. This is read-only research. No code was changed.

Scope: the Today-tab note cards ([`gas-app/Index.html`](file:///home/mike/projects/day-planner/gas-app/Index.html) ~790-865), `syncDailyNoteToCards` / `saveDailyNote` ([`gas-app/Script.html`](file:///home/mike/projects/day-planner/gas-app/Script.html) ~5416-5450), and the read/write path ([`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) `docsGetBodyElements_` :100, `extractDaySectionText_` :1937, `saveDailyDocCards` :2016).

## Verdict

You can't put a live, editable, section-clipped Google Doc inside the GAS web app. When you're signed in, `/edit` on a private Doc sends `frame-ancestors https://docs.google.com`, so it can't be framed (seen live, S1). Even where framing works, the Docs editor and preview draw onto a canvas inside a cross-origin frame. We can't scroll it or target a heading in it. All that's left is a fixed pixel offset, and that offset breaks as soon as anything above the section changes length. Publish-to-web does embed (S2, S3), but it makes the private notes public on HOME, and an admin can turn it off on WORK. Recommendation:
1. Read the day's section through the Docs API (the read path we already have, no new scope).
2. Show it as sanitized, read-only HTML: a "Doc view" mode that keeps headings, bold, links, lists and images.
3. Put an "Open in Docs at this heading" link on each card (`/edit#heading=h.xxx`, built from a fresh read).
4. Before we invite anyone to edit in Docs, make `saveDailyDocCards` revision-safe. Today it deletes and re-inserts the whole day section with no `writeControl`, so it silently overwrites edits made directly in the Doc.

## Method matrix

Tags: **V** = verified (source or command in brackets). **I** = inferred. Sources are listed below the table.

| Method | Works HOME? | Works WORK? | Can target section? | Editable? | Scope impact | Effort |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| iframe `/edit` | No: signed-in private Doc sends `frame-ancestors https://docs.google.com` **V** [S1] | No, same header **I** | Fixed offset only. `#heading=` works only at top level **I** | Would be, but blocked **V** [S1] | none | n/a |
| iframe `/preview` | Unknown. Anonymous public Doc: no XFO or frame-ancestors **V** [S2]. Signed-in private Doc: untested. Sites embeds it, which suggests framing is allowed **I** | Unknown. Also needs third-party cookies from inside the `*.googleusercontent.com` frame, which WORK policy may block **I** | Fixed CSS offset clip only. Canvas render, no DOM ids **I**. Each day starts on a new page (page break, Code.gs:2080), so it could clip at a page edge, but page height depends on zoom and width **I** | No | none (the browser session does the auth) | S |
| iframe `/mobilebasic` | Same as `/preview`: no XFO when anonymous **V** [S2]; signed-in untested | Same third-party-cookie risk **I** | Static HTML, so `#h.x` might scroll if headings carry ids **I** | No | none | S |
| iframe Drive `/file/d/ID/preview` | Anonymous: 200, no XFO **V** [S2]. This is Drive's documented "Embed item" path **I** | Same third-party-cookie risk **I** | Fixed offset only **I** | No | none | S |
| Publish to web `/pub?embedded=true` | Embeds: 200, no XFO or frame-ancestors on a published Doc **V** [S2]. But the URL is world-readable, so the notes become public | Admin can turn publishing off. Org-only publish is offered **V** [S3]. On gsa.gov it's likely off **I** | Sampled `/pub` headings have **no** `id`s **V** [S2, `grep '<h[1-6] '`], so no fragment. Docs API has no CreateBookmark request **V** [S5]. Offset clip only | No. Republishes after "a few minutes" **V** [S3] | none, but a privacy leak | S |
| Drive `files.export` text/html, then slice by heading | Yes. `drive.file` is an accepted scope, 10 MB cap **V** [S4] | Yes, same scope **I** | Yes, slice by the "Day Planner - ..." H2 text. Sampled export headings carry no ids **V** [S2] | No | none (`drive.file`) | M. The CSS is class soup (`c4`, `c11`); it needs sanitizing and re-styling |
| **Render Docs API JSON (recommended)** | Yes, extends `docsGetBodyElements_` **V** [S6] | Yes. The same Docs Advanced Service already runs on WORK **V** [S6] | Exact. Reuses `isDayHeadingElement_` / `isAnyDayHeadingElement_`. `headingId` is returned read-only per paragraph **V** [S5] | Read-only. Editing stays in the line editor | none | M |
| Link "Open at heading" `/edit#heading=h.x` | Yes, top-level tab **V** [S7] | Yes **I** | Exact, as long as the id is fresh. Our save re-creates the paragraphs, so ids change on every save **I** | Yes, in Docs | none | XS |
| Document tabs (one tab per day, `?tab=t.x`) | Possible: `AddDocumentTabRequest` exists **V** [S5] | **I** | Exact, by tab | In Docs | none | L (restructures the whole doc model). Not recommended now |

Sources:
- S1: memory `project_gdoc_iframe_blocked_link_redesign.md`. A live CDP console captured the CSP violation on a signed-in `/edit` iframe (2026-09-27).
- S2: `curl -s -D -` run on 2026-10-30.
  - Docs tested: public Doc `195j9eDD3ccgjQRttHhJPymLJUCOUjs-jmwTrekvdjFE` (Docs API quickstart sample) and published Doc `1z4BXT6cjZnA6HUgrX2xnOo3tPSLw38VyFbBH92JZOv0`.
  - `/edit`, `/preview`, `/mobilebasic`, `/pub`, `/pub?embedded=true`, Drive `/file/d/ID/preview`: 200 with no `x-frame-options` or `frame-ancestors`.
  - `export?format=html`: `x-frame-options: SAMEORIGIN`.
  - `/pub` on an unpublished Doc: 302 to accounts.google.com, which sends `x-frame-options: DENY`.
  - Anonymous only. A signed-in request may get different headers (S1 shows it does for `/edit`).
- S3: [Publish files from Google Drive](https://support.google.com/docs/answer/183965). Covers the Embed option, auto-republish delay of "a few minutes", the admin switch that turns publishing off, and the everyone / org / group visibility choices.
- S4: [files.export reference](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export). Scopes include `drive.file`; 10 MB limit.
- S5: [Docs API documents reference](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents) and [Request types](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/request).
  - `ParagraphStyle.headingId` is read-only.
  - `InlineObject...contentUri` has a 30-minute lifetime and is "tagged with the account of the requester".
  - No `CreateBookmarkRequest` exists. `AddDocumentTabRequest` does.
- S6: repo code. Code.gs:100 (Docs.Documents.get); Code.gs:2016-2088 (delete+insert batchUpdate, no `writeControl`); Code.gs:1386 (docUrl is `/edit`); [`gas-app/appsscript.json`](file:///home/mike/projects/day-planner/gas-app/appsscript.json).
- S7: the `#heading=h.x` deep-link format ("Copy heading link"). Third-party write-ups only, e.g. [labnol](https://Labnol.org/internet/links-in-google-docs/28010/). No official Google page. The spike confirms it.

Scope note: `appsscript.json` already lists `drive.readonly` next to `drive.file`. None of the methods above needs it. Recommended paths stay inside `drive.file`.

## Decisions (recommended option first)

1. How should the note panel show the Doc?
   A. Render the day section from the Docs API JSON as sanitized read-only HTML (recommended).
   B. iframe `/preview` with a fixed-offset clip.
   C. Publish-to-web embed.
   D. Keep text-only cards.
   Why A: exact targeting, the same behaviour on HOME and WORK, no new scope.
2. Where should the rendered view live?
   A. Replace the dormant `noteViewMode === 'doc'` "Option 2 Preview" textarea (Index.html:857) with the read-only render, behind the existing cards/doc toggle (recommended).
   B. Add a per-card "view in Doc styling" expander.
   C. Add a separate tab.
3. Should each card get an "Open in Docs at heading" link?
   A. Yes. Read `headingId` on every load and build `docUrl + '#heading=' + id` (recommended).
   B. One link per day (the H2) only.
   C. No.
4. Should saves be revision-safe?
   A. Yes. Read `revisionId` in `docsGetBodyElements_`, send `writeControl.requiredRevisionId` in `saveDailyDocCards`, and on conflict reload and show the user an error. This is a prerequisite for 3A, because a link that invites editing in Docs would otherwise lose those edits on the next app save (recommended).
   B. Last writer wins (today's behaviour).
5. Should we close the evidence gap on signed-in `/preview` framing?
   A. Run one 15-minute CDP probe on HOME during the spike, record it in memory, and don't build on it (recommended).
   B. Skip it.
   Why A: S1 tested `/edit` only. Running it settles the "can't iframe" claim for good.

## Risks

1. **Clobber.** Formatting, images or comments the user adds in the Doc show up in the render, then the next save in the line editor flattens them to H2/H3/bullets/text. Mitigations:
   - Decision 4A.
   - Save only when that day's section is dirty.
   - If the Doc section has elements the line editor can't round-trip, show "Edited in Docs" and make the card read-only.
2. **Unstable heading ids.** `deleteContentRange` + `insertText` makes new heading paragraphs, so their ids change on every save (I). Links must come from the latest read. Never cache them across saves.
3. **XSS.** Doc text is user-controlled. The renderer must escape every text run and allow only a fixed set of tags:
   - Allowed: h2, h3, p, ul, ol, li, strong, em, u, s, img, a.
   - `<a>` must carry `target="_blank" rel="noopener noreferrer"`.
   - `img src` must be https on `*.googleusercontent.com`.
   - No inline styles.
4. **Image URI expiry.** `contentUri` expires after 30 minutes (S5). Re-read the Doc when the view is reopened. Never cache image URLs.
5. **Payload and quota.** Asking for richer `fields` makes each Docs.get bigger. Request the rich fields only when the doc view is open, and keep the cards path on the narrow mask.
6. **GAS HtmlService truncation.** Renderer code in Script.html must follow [`gas-html-safe-chars`](file:///home/mike/projects/day-planner/.agents/rules/gas-html-safe-chars.md) (`'https:' + '/' + '/'`).
7. **WORK.** The Docs Advanced Service already runs there, so risk is low. The iframe options also depend on third-party cookies, which WORK may block. That's why they're rejected.

## Minimal spike plan (decisions 1A + 3A + 4A, HOME only)

1. Write the red tests first. Create `tests/docSectionRender.test.js` for a pure `renderDocSection(paragraphs, inlineObjects)` in `src/integration/docSectionRender.js`, so it bundles into Engines.gs through [`tools/build-gas-engines.js`](file:///home/mike/projects/day-planner/tools/build-gas-engines.js). Cases:
   - H2/H3 map to tags with `data-heading-id`.
   - Bullets with nesting levels map to ul/li.
   - Bold, italic, underline, strike.
   - Links carry `target="_blank" rel="noopener noreferrer"`.
   - `<script>` / `onerror` / `javascript:` in text or link are escaped or dropped.
   - A non-googleusercontent image is dropped.
   - An empty section renders an explicit empty state, not "".
2. Make the tests pass by implementing the renderer. Run `npm test` and `npm run lint`, which includes `build-gas-engines --check` and `check:catches`.
3. In Code.gs, add `getDailyDocSectionView(dateStr)`:
   - Call Docs.Documents.get with `fields: 'revisionId,inlineObjects,body.content(startIndex,endIndex,paragraph(paragraphStyle(namedStyleType,headingId),bullet(listId,nestingLevel),elements(pageBreak,inlineObjectElement.inlineObjectId,textRun(content,textStyle(bold,italic,underline,strikethrough,link.url)))))'`.
   - Slice with `isDayHeadingElement_` / `isAnyDayHeadingElement_`.
   - Return `{ html, headingLinks: [{ text, url }], revisionId }`.
   - On error, call `logError(context, err)` and rethrow. Never return a placeholder.
   - Add the IIFE alias `global._getDailyDocSectionViewInternal` and a top-level delegator. Check: `grep -c "^function getDailyDocSectionView" gas-app/Code.gs` = 2.
4. Add a GAS unit test in [`gas-app/UnitTests.gs`](file:///home/mike/projects/day-planner/gas-app/UnitTests.gs) that slices a fixture of three day sections. Run it with `npm run rpc -- runSelfTest --deploy`.
5. In Script.html / Index.html, replace the Option 2 textarea in `noteViewMode === 'doc'` with `x-html` of the server-sanitized HTML and a heading link list. Load it only when that mode opens. Show a loading state and an error state that displays `err.message` only.
6. Make saves revision-safe (4A):
   - Add `revisionId` to the `docsGetBodyElements_` mask.
   - Pass `writeControl: { requiredRevisionId }` in `saveDailyDocCards`.
   - Red test: a stale revision makes the save return an error. The client then rolls back through the existing `rollbackUnsavedNoteCache` path and tells the user.
   - Keep the existing rule: a failed save is never shown as saved.
7. Run the side probe (decision 5A, about 15 minutes). In the HOME `/dev` tab, use [`tools/ensure-chrome.js`](file:///home/mike/projects/day-planner/tools/ensure-chrome.js) and the `chrome-console` skill to inject one iframe each for `/preview`, `/mobilebasic` and Drive `/file/d/ID/preview` of the real monthly Doc into `userHtmlFrame`. Record whether each renders or which CSP/XFO console error it hits, and write the result into memory S1. Don't ship any iframe.
8. Verify live on HOME:
   - The doc view renders today's section with headings and links.
   - The heading link opens Docs at the right heading.
   - Edit the Doc, then save from the app: the conflict error shows and nothing is lost.
   - Probe-live reports zero console errors.
9. Promote per the gas-environments rule (`clasp push` + deploy HOME, `npm run push:work`).
