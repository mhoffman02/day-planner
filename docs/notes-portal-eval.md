# Notes panel as a "portal": the tab-per-day variant

Date: 2026-10-30. Read-only research; no code changed. Follows [`docs/notes-doc-embed-eval.md`](file:///home/mike/projects/day-planner/docs/notes-doc-embed-eval.md) (read it first; its sources S1-S7 are reused here). Assumes `saveDailyDocCards` is revision-safe (`writeControl.requiredRevisionId`), which is being fixed in this session.

Proposal under review: each Today-tab note panel is a keyhole iframe onto the monthly notes Doc, in minimal chrome, clipped by CSS to that day. Each day gets its own Docs **tab**, so the iframe can target one tab instead of clipping to a heading.

## Verdict and pushback

1. **Tabs fix targeting, not framing.** Framing was the blocker. A signed-in, private `/edit` sends `frame-ancestors https://docs.google.com` (verified, S1). Tabs leave that header alone, so the editable portal is still blocked, tab or no tab. Only the read-only renderers (`/preview`, `/mobilebasic`, `/pub`) might frame. Your Sites practice is read-only too: Sites embeds a preview, not the editor.
2. **The order of operations matters.** The only open question is whether a signed-in, *private* Doc renders inside the GAS iframe (`*.script.googleusercontent.com`). If it doesn't, per-tab URLs are worthless for the portal. So probe framing on today's Doc first (P1). Only if P1 passes is P2 (does `?tab=` select a tab in `/preview`) worth running. Don't restructure storage to enable a portal that may not render.
3. **Per-day tabs earn their keep as a storage change, with no iframe.** The real wins don't depend on the portal:
   1. Stable deep links (`?tab=t.x` survives saves; `#heading=h.x` ids are recreated on every save).
   2. You can use H2s freely inside a day, because "any H2 is a day boundary" (Code.gs:1919) stops being the parser's rule.
   3. Each day reads and writes as a whole tab body, not a scanned range.

   It costs an L-sized migration and has one silent-data-loss trap (see §2.3). Treat it as its own decision, not as a portal enabler.
4. **Clipping is not a usable targeting method** (§3). With a tab per day you would not need it anyway.

## 1. Addressing and framing

Tags: **V** = verified (source given). **U** = unverified (a probe is given). Each U row has a 15-minute probe in §1.2.

### 1.1 Claims

| # | Claim | Status | Evidence / probe |
| :--- | :--- | :--- | :--- |
| A1 | Each Docs tab has an id that appears in the URL | **V** | Docs API "Work with tabs" guide: "Each tab has its own title and ID (appended in the URL)" [T1]. The guide does not print the `?tab=t.x` syntax. The format `?tab=t.0` is what the Docs UI produces (I) |
| A2 | `/edit?tab=t.0`, `/edit?tab=t.0&rm=minimal`, `/preview?tab=t.0` and `/mobilebasic?tab=t.0` return 200 with no `x-frame-options` and no `frame-ancestors` **anonymously, on a public Doc** | **V** | `curl -s -D -` on public sample Doc `195j9eDD3ccgjQRttHhJPymLJUCOUjs-jmwTrekvdjFE`, run 2026-10-30. All four were 200, and neither header was present |
| A3 | Signed-in `/edit` (any query, including `?tab=` and `rm=minimal`) is unframeable for a private Doc | **V** for `/edit` [S1]; **U** that `?tab=`/`rm=minimal` don't change it (expected the same) | P1 |
| A4 | Signed-in `/preview` or `/mobilebasic` of a **private** Doc renders inside the GAS iframe | **U** | P1. Two separate risks: (a) a CSP/XFO header that only signed-in responses get; (b) the docs.google.com session cookies are cross-site inside a frame whose ancestor is `*.googleusercontent.com`, so they are subject to third-party-cookie blocking (I) |
| A5 | `/preview?tab=t.x` or `/mobilebasic?tab=t.x` shows **only** that tab | **U** | P2. A2 shows the server accepts the parameter. It does not show that the renderer honours it. `/mobilebasic` may render every tab in sequence (I) |
| A6 | Publish to web (`/pub?embedded=true`) frames | **V** anonymous [S2] | It makes the notes world-readable on HOME, which is a privacy leak. Rejected in the prior eval |
| A7 | Publish to web can publish a **single tab** | **U** | P3. Third-party sources only cover export/print, which by default includes "the active tab" only [T3] |
| A8 | Any of the above is editable | **V** no | `/preview`, `/mobilebasic` and `/pub` are read-only renderers. The editor is `/edit`, which is blocked (A3) |
| A9 | WORK (gsa.gov) blocks publish-to-web | **U**, likely | An admin can turn publishing off or restrict it to the org [S3]. Federal tenants commonly do (I). P4 |
| A10 | WORK blocks third-party cookies, or picks the wrong signed-in account inside the frame | **U**, likely | Chrome Enterprise `BlockThirdPartyCookies` is common on managed machines (I). Separately, the WORK browser holds several Google sessions (memory: the session-cookie collision that forced WORK to `/exec` only). An iframe without `authuser=` will use account 0, which may not own the Doc, and shows "You need access" (I). P1 on WORK |
| A11 | Cross-origin scroll or DOM targeting of the framed Doc is impossible | **V** | Same-origin policy. The parent cannot read or set `contentWindow.scrollY` or query the DOM of a docs.google.com frame. `/pub` headings carry no ids, so a URL fragment can't target them either [S2] |

### 1.2 Probes (about 15 minutes each, HOME first; never ship an iframe)

Run all of them from the HOME `/dev` tab, opened with [`tools/ensure-chrome.js`](file:///home/mike/projects/day-planner/tools/ensure-chrome.js), and drive them with the `chrome-console` skill inside `userHtmlFrame`. A generic browser tool would trip Google sign-in (rule `live-google-auth-browser-tool`). Record each result in memory `project_gdoc_iframe_blocked_link_redesign.md`.

- **P1, private framing.** Inject one 400x300 iframe each for the October 2026 notes Doc: `/edit?rm=minimal`, `/preview`, `/mobilebasic`, and Drive `/file/d/ID/preview`. For each, record:
  - whether it renders content, shows a sign-in or "need access" page, or is blank;
  - any console `Refused to frame` / CSP / XFO error.

  Repeat on WORK `/exec` with and without `&authuser=<work email>`.
  - Pass: at least one renders the real Doc on both HOME and WORK.
  - Fail on either: close the portal idea for good.
- **P2, per-tab selection** (only if P1 passes). Add two tabs to a scratch Doc in the Day Planner folder, with distinct text in each. Frame `/preview?tab=<tab2 id>` and `/mobilebasic?tab=<tab2 id>`.
  - Pass: only tab 2's text is visible.
  - Also note the chrome height above the content, which you'd need to crop.
- **P3, single-tab publish.** On the same scratch Doc, open File > Share > Publish to web. Record whether there's a tab picker, and what `/pub?embedded=true` shows. Then unpublish. Informational only, because publishing stays rejected on HOME for privacy.
- **P4, WORK publish policy.** On any WORK Doc, open File > Share > Publish to web. Record whether it's greyed out, says "your administrator", or is limited to gsa.gov. Two minutes. Don't publish anything.

## 2. Tabs through the Docs API (storage change)

### 2.1 API facts

| Fact | Status | Source |
| :--- | :--- | :--- |
| `documents.get` and `documents.batchUpdate` accept `drive.file` | **V** | Reference pages list `documents`, `drive`, `drive.file` (batchUpdate) and also the readonly variants (get) [T2, T4]. Code.gs:100 and :2088 already run under `drive.file` on HOME and WORK [S6] |
| `includeTabsContent=true` fills `Document.tabs` **instead of** `body`. When omitted, `body` holds the **first tab only** and `tabs` is empty | **V** | [T1, T2] |
| `Location.tabId` / `Range.tabId`: "When omitted, the request is applied to the first tab" | **V** | Request reference [T4] |
| `ReplaceAllText`, `DeleteNamedRange` and `ReplaceNamedRangeContent` default to **all** tabs | **V** | [T1] |
| `AddDocumentTabRequest`, `DeleteTabRequest` and `UpdateDocumentTabPropertiesRequest` exist | **V** | [T4] |
| `AddDocumentTab` returns the new `tabId` in its reply | **U** | Read the batchUpdate reply in the spike. Fallback: re-read and find the tab by title |
| Tabs nest (`childTabs`), up to 3 levels | **U**, widely reported | [T3]. The reader must flatten recursively either way |
| Limit of about 100 tabs per Doc, shared with subtabs. Some say it slows down past about 50 | **U**, third-party only | [T3]. 31 tabs + 1 cover tab = 32 is inside the reported limit. Probe P5 |
| Drive `fullText contains` indexes every tab, not just the first | **U** | P5. `searchArchiveNotes` depends on it (Code.gs:3463) |
| Download/print covers the active tab by default; "All tabs" is a separate option | **U**, third-party | [T3]. This is a UX cost for the "printable monthly binder" goal in `getOrCreateDailyDocContent`'s JSDoc |
| A revision check is document-wide (`writeControl` applies to the whole Doc) | **V** | [T2] |

`writeControl` being document-wide means tabs do **not** narrow conflicts. An edit in Docs to Monday's tab still fails Tuesday's app save under `requiredRevisionId`. `targetRevisionId` merges across tabs, but our save deletes and replaces the whole tab body, so a concurrent edit inside the same tab would still be overwritten. Keep `requiredRevisionId`.

### 2.2 Migration cost (heading sections to one tab per day)

Effort: **L**, about 3-4 sessions, including tests and a migration tool.

| Area | Change |
| :--- | :--- |
| [`gas-app/Code.gs`](file:///home/mike/projects/day-planner/gas-app/Code.gs) `docsGetBodyElements_` :100 | Keep it for single-body Docs: dictation scratch, Run Log, legacy months. Add `docsGetMonthTabs_(docId)`, which calls `includeTabsContent: true` with mask `revisionId,tabs(tabProperties(tabId,title,index),childTabs,documentTab.body.content(...same paragraph fields...))`. It flattens `childTabs` and returns `{revisionId, tabsByDate}` |
| `extractDaySectionText_` :1937, `isDayHeadingElement_` :1902, `isAnyDayHeadingElement_` :1919 | Replace the heading scan with a lookup by tab. Tab title key: `YYYY-MM-DD Ddd` (ISO date first, so it's machine-parseable). A tab the user renamed into an unparseable title must **throw** with the title in the message, never be skipped |
| `saveDailyDocCards` :2016 | Existing tab: one batchUpdate. `deleteContentRange {tabId, 1..end-1}`, then `insertText {tabId, index 1}`, then the style requests with `tabId` on every range, all under `requiredRevisionId`. New day: `addDocumentTab` at the sorted index, then the content. That's two batchUpdates and not atomic, but a retry is idempotent because the tab now exists. `buildDaySectionRequests_` gains a `tabId` parameter. Page-break logic goes away |
| `getOrCreateMonthlyNotesDoc_` :1874 | Creates the Doc with tab 1 = "Index" (the H1 title). Day tabs get added on first save |
| `getDailyDataRange` :1725 and `getDailyData` :1372 | Still one `Docs.get` per month, but with tabs content. `docUrl` becomes `/edit?tab=t.x` per day, which is a stable deep link |
| `searchAcrossAllMonthlyDocs` :3221 and `searchArchiveNotes` :3443 | Iterate tabs. The heading-based date comes from the tab title instead of `parseArchiveNoteHeading_`. If P5 shows Drive full-text skips non-first tabs, archive search needs its own index |
| [`gas-app/NotesRepository.gs`](file:///home/mike/projects/day-planner/gas-app/NotesRepository.gs), hub (`QueueProcessor.gs:285-300`, `HubController.gs:483`) | **No change needed.** These write the separate "Meeting Notes – <Name>" Docs, not the monthly Doc. Latent issue either way: `fetchDoc_` reads `body` without `includeTabsContent`. If someone adds a tab to a Meeting Notes Doc by hand, the hub silently reads and writes tab 1 only. Add a fail-loud guard (throw if `tabs.length > 1`) whatever is decided here |
| [`gas-app/UnitTests.gs`](file:///home/mike/projects/day-planner/gas-app/UnitTests.gs) :257-271 | The March 1901 monthly-doc self-test moves to the tab model |
| Node tests | `tests/helpers/gasRuntimeStubs.js` needs a fake for tabs, `tabId` on ranges, and `addDocumentTab`. Also rework the near-verbatim ports in `gasDocIdempotency`, `gasDocsBulletLeak`, `docSaveConflict`, `failClosedSaves` and `saveConcurrency`, and the `src/gasBridge.js` mock |
| Existing Docs | A one-shot migrator per month: read the sections, `addDocumentTab` for each day, re-insert each day's content, then trim tab 1. The Docs API has no request that copies or moves content between tabs (none in [T4]). So the move is a rewrite, and it loses comments, suggestions, images and any formatting beyond H2/H3/bullets/links. Alternative: tabs for new months only, plus a **dual-format reader forever** (detect by tab count; throw if one Doc has both day tabs and day headings) |

### 2.3 The silent-data-loss trap

Any code path that still reads `body` or writes without `tabId` will, on a tabbed Doc, see **only tab 1** and write **into tab 1**, with no error. The API defaults to the first tab [T1, T4]. That makes it the classic fail-silent hazard. Three places it can happen:
1. A version-skewed client. WORK runs the older version until the user repoints it.
2. A forgotten caller, such as one of the search paths.
3. The hub reader.

Mitigation, required before any tabbed Doc exists:
1. Every monthly-doc reader asserts the format it expects.
2. Every writer passes an explicit `tabId`.
3. A red test proves that a legacy reader given a tabbed Doc **throws** rather than returning tab 1.

### 2.4 Performance

The tab-mode read returns the same text in a different envelope, so the payload grows only by the tab properties. That's a few hundred bytes per tab. Each save is still one Docs.get plus one batchUpdate (two batchUpdates on a new day). Per-month cold-load cost is unchanged, at about 3 s server time (memory: GAS startup perf). UI slowness past about 50 tabs is third-party hearsay and matters only when a person opens the Doc. 32 tabs is fine (U, P5).

- **P5, tabs at scale** (15 min, HOME scratch Doc). Use a throwaway rpc helper to add 32 dated tabs with text via `addDocumentTab`, and time `Docs.get(includeTabsContent)`. Then:
  1. Search Drive for a word that appears only in tab 20.
  2. Download the Doc as PDF and count the tabs included.
  3. Open it on the Docs mobile app.
  4. Delete the scratch Doc.

## 3. Cross-origin CSS clipping

**No**, not as a way to target a section.
- **What CSS can do.** It can crop a frame: put a wrapper with `overflow:hidden` and a fixed height, and give the iframe a negative `top`.
- **What it can't do.** It can't know where the section is. The parent can't read the frame's layout, scroll it, or size it to the content (A11).
- **`/preview` and `/edit` draw paginated, canvas-style pages.** They scale to the frame width, so pixel offsets shift whenever the zoom, the fonts, the frame width or the content above changes.
- **The frame keeps its own scrollbar.** Its scroll position is the user's, not ours, so the keyhole drifts as soon as anyone scrolls inside it.

With one tab per day, clipping shrinks to cropping a fixed-height chrome strip off the top. That is feasible, but Google can change that strip without notice. Clipping therefore adds nothing that tabs or the API render don't already give, and P1 still gates everything.

## 4. Options, ranked

| Rank | Option | Effort | Risk | What the user gains |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **(a) Read-only Docs API render in the panel.** Sanitized HTML of the day's paragraphs, from the read path that already exists | M | Low. XSS needs an allowlist renderer. Image `contentUri` expires after 30 minutes. Same behaviour on HOME and WORK, no new scope | It looks like the Doc (headings, bold, links, lists, images) inside the planner, works everywhere, and has exact targeting. Edits stay in the card editor, which saves revision-safe |
| 2 | **(b) "Open this day in Docs" deep link** on each panel. `#heading=h.x` from the latest read today; `?tab=t.x` if (c) ships | XS | Low. Heading ids change on every app save, so build the link from a fresh read and never cache it | One click to the real, full editor at the right place. That's the editing half of the "portal", without any framing risk |
| 3 | **(c) Tab per day, storage only, no iframe** | L | Medium. Lossy migration of existing Docs (or a dual-format reader), the silent tab-1 trap (§2.3), print/export defaults to one tab, Drive search across tabs unverified | Deep links that stay stable across saves. Day boundaries no longer depend on H2 parsing, so you can use H2s freely inside a day. In Docs, the sidebar lists the month's days |
| 4 | **(d) iframe portal** (`/preview` or `/mobilebasic`, with tabs if P2 passes) | S to build, but gated by P1+P2 | High. Third-party-cookie and account-index fragility (the WORK multi-account browser especially), Google chrome changes, read-only anyway | True Google rendering, comments visible (maybe). Only real advantage over (a): zero renderer code to maintain |
| x | Publish to web | S | Unacceptable. World-readable notes on HOME, likely disabled on WORK | Rejected |

Recommended path: (a) + (b) now, P1 as one cheap side probe, and (c) only if, after living with (a)+(b), you still want stable links or a day-tabbed Doc for its own sake.

## Sources

- S1-S7: see [`docs/notes-doc-embed-eval.md`](file:///home/mike/projects/day-planner/docs/notes-doc-embed-eval.md).
- T1: [Docs API, Work with tabs](https://developers.google.com/workspace/docs/api/how-tos/tabs). Covers `includeTabsContent` behaviour, the first-tab default, the all-tabs default for ReplaceAllText and named ranges, and "ID (appended in the URL)".
- T2: [documents.get](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/get) and [documents.batchUpdate](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate). Cover the scopes, including `drive.file`, and `writeControl`.
- T3: third-party reports, not Google. They cover the tab limit (~100, shared with subtabs), 3 nesting levels, and export of the active tab only by default:
  - [9to5google](https://9to5google.com/2024/10/07/google-docs-document-tabs/)
  - [Google Docs community thread](https://support.google.com/docs/thread/318049082/can-you-guys-increase-the-document-tab-limit?hl=en)
  - [Android Authority](https://www.androidauthority.com/google-docs-tabs-3488865/)
- T4: [Docs API request types](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/request). Covers AddDocumentTab, DeleteTab, UpdateDocumentTabProperties, and `Location.tabId`, which applies to the first tab when omitted.

## Decisions for the user

1. **Portal iframe.**
   A. Don't build it. Run P1 once as a 15-minute side probe and record the result.
   B. Build it now on `/preview`.
   C. Drop it without probing.
   Recommended: A. Tabs don't remove the framing blocker, and P1 settles the question cheaply.
2. **In-panel view.** T/F: build the read-only Docs API render (option a) as the panel's "Doc view". Recommended: T. Exact targeting, same behaviour on HOME and WORK, no new scope, no cookies.
3. **Deep link.** T/F: add "Open this day in Docs" on each panel, built from a fresh read (`#heading=` today). Recommended: T. That's the editing half of the portal for an XS cost.
4. **Per-day tabs as storage.**
   A. Defer until (a)+(b) have been in use for a few weeks and P5 has run.
   B. Adopt for new months only, with a dual-format reader.
   C. Migrate every month now.
   Recommended: A. The gain (stable links, freer H2s) is real but small next to an L-sized, lossy migration and the tab-1 trap.
5. **Tab-1 guard.** T/F: add a fail-loud check now so that every Docs reader (monthly notes and `NotesRepository.fetchDoc_`) throws when a Doc has more than one tab. Recommended: T. Today, a tab added by hand would make the app silently read and write tab 1 only. That's a latent data-loss path whatever you decide in 4.
6. **Publish to web.** T/F: keep it rejected on HOME and WORK. Recommended: T. It makes the private notes world-readable, and WORK likely disables it anyway (P4 can confirm).
