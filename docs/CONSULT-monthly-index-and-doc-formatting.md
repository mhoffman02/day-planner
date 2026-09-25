# Consultation: Monthly Index & Decisions — nav column + Monthly Doc formatting
Date: 2026-09-25 · Scope: UX + technical writing advisory. No code changed.

## Part 1 — In-app "jump to day" column

### Current state
`index.html:700-721` already ships a 4th column: header **"Direct Doc Link"**, cell link **"View Google Doc"**, `target="_blank"`.
So this is **not a rename** — it is a **5th column** with a different destination (in-app SPA route vs. external Google Doc). Any label must be chosen *against* the neighbour, and "Planner Link" next to "Direct Doc Link" is the single worst pairing available: two "Link" columns, no cue which leaves the app.

### Rule
**Headers are nouns. Cell affordances are verbs.**

| Candidate | As header | As cell link |
|---|---|---|
| Jump to Day | poor — verb phrase in a noun row | **best** — states the action and the destination |
| Daily Page | **best** — noun, parallel with Date / Topic / Summary | weak — looks like a label, not a control |
| Planner Link | poor — collides with "Direct Doc Link" | poor — "link" describes mechanism, not destination |
| View Note | ambiguous — the Google Doc *is* the note | ambiguous, same reason |

### Recommendation
- Header: `Daily Page` (`Day` if column width is tight).
- Cell: `Jump to Day` + `arrow_forward` (or `today`) Material icon — matches existing icon-in-link idiom.
- Rename the existing 4th column header `Direct Doc Link` → **`Source Doc`**, cell stays `View Google Doc` with an `open_in_new` icon. Now the pair reads *Source Doc / Daily Page* — destination vs. destination, unambiguous.
- Column order: put `Daily Page` before `Source Doc`. In-app is the common action; the Doc is the escape hatch.

### Implementation constraints
- The jump must be a **router action** (`@click="goToDate(idx.date)"` on a `<button>` or in-app `<a :href>`), **not** `target="_blank"`. That behavioural difference is the main thing distinguishing the two columns; losing it defeats the labelling work.
- **Accessible name must include the date.** A screen-reader link list of twelve identical "Jump to Day" links is unusable:
  `:aria-label="'Open daily planner for ' + idx.date"`. Keep `scope="col"` on the new `<th>`, consistent with the existing header row.
- Visible text can stay short ("Jump to Day") since the aria-label carries the date.

### Tech-writer finding
`REQUIREMENTS.md:88` calls the destination the **"2-Page Daily Spread"**; §4.3 repeats it; the brief calls it the **"3-column daily planner"**. These are the same screen under two names. Use the user-facing product term consistently in UI copy and update the spec (or state the two are synonyms) — do not let the docs and the UI diverge silently. I have not picked one for you; flagging it as a decision.

---

## Part 2 — Formatting the Monthly Notes Doc

### The cost that dominates every option: writes are not idempotent
`saveDailyDocCards` (`gas-app/Code.gs:1081-1113`) unconditionally calls `body.appendPageBreak()` then appends the day's section. **Re-saving the same day duplicates its section.** This is a live correctness bug today, independent of formatting.

Options 1 and 2 both *require* fixing it first, because any "prettified" view must be regenerated, not accumulated. DocumentApp has no range-replace primitive: you locate the day's HEADING2, walk `body.getChild(i)` forward to the next HEADING2, and `removeChild` in **reverse index order**, taking care never to remove the body's final paragraph (DocumentApp throws). That plumbing — not the styling — is the real work, and Option 2 needs it too.

### Verified API facts (checked 2026-09-25 against Google's reference)
- `Document.getTabs()`, `getTab(id)`, `getActiveTab()`, `Tab.asDocumentTab()`, `DocumentTab.getBody()` **all exist and are documented** (not gated).
- **Compat, and this is the discriminator:** `Document.getBody()` "retrieves the first tab's `Body` or, for scripts that are bound to a document, the **active tab's** body." So legacy calls are safe *only* in the unbound/openById path.
- `Document.getBookmarks()` is explicitly documented as returning bookmarks **"in the first tab"** — same first-tab-only semantics.
- Bookmarks are supported: `Document.addBookmark(position)` / `Bookmark.getId()`, so a linked index at the top of the doc **is feasible** (via `#bookmark=` anchors). What is *not* available is a stable `#heading=h.xxxx` anchor id — headings expose no anchor accessor. Bookmark IDs also do not survive regeneration, so the top index must be rebuilt in the same pass that rewrites the body.

### What that means for this repo
- `saveDailyDocCards` (`Code.gs:1098`) and `searchAcrossAllMonthlyDocs` (`Code.gs:~1834`) both use `openById(...).getBody()` → **first tab**. If the raw `#data` tab is tab 1, these keep working under Option 2.
- **But** the in-Doc search sidebar (`Code.gs:1875-1904`, uses `DocumentApp.getUi()`) is **document-bound**. Under a bound execution, `getBody()` resolves to the **active tab**. A user sitting on the `#view` tab would search prettified text and get different results — or, if `#view` is regenerated, stale ones. That is a genuine Option-2 regression, and the reason Tabs adds risk without removing the hard part.

### Ranking

**1. Option 3 — Doc as durable data backend, SPA as presentation layer — plus a thin slice of Option 1.**
Best ROI by a wide margin. The SPA already parses (`src/indexParser.js`) and renders; every hour spent on DocumentApp styling is an hour spent maintaining a second renderer that no one edits in. *But not bare Option 3:* keep the HEADING2/HEADING3 emission you already do (`Code.gs:1102-1107`). It is already written, it is free, and it keeps the Doc's native outline pane navigable and the printout sane — which matters for a Franklin Planner user who plausibly prints. Drop index-links-at-top. **Do fix the append-duplication bug** — that is the highest-value change on this list and it is required under every option.

**2. Option 1 — live prettify in place.**
Feasible, including the linked top index via bookmarks, but it costs full-section regeneration on every save plus bookmark rebuild, and it puts styling logic in the one place with no test harness and the slowest feedback loop. Medium cost, low marginal benefit over Option 3 + headings. Revisit only if a concrete need appears for a standalone, share-a-link-to-the-Doc artifact.

**3. Option 2 — two tabs (`#data` / `#view`).**
Last. It inherits all of Option 1's regeneration cost, adds a second source of truth to keep in sync, and introduces the bound-script active-tab hazard above that would break the existing in-Doc search sidebar. The Tabs API being GA does not help: the expensive part was never tab creation. Only reconsider if the Doc becomes a shared, read-by-others artifact — the one scenario where a clean `#view` surface earns its keep.

### Suggested sequence
1. Make `saveDailyDocCards` idempotent (replace-day-section). Bug fix, not a feature.
2. Ship the `Daily Page` / `Jump to Day` column + rename `Direct Doc Link` → `Source Doc`.
3. Reconcile the "2-Page Daily Spread" vs. "3-column daily planner" naming in REQUIREMENTS.md/PRD.md.
4. Leave Doc styling where it is.

### Sources
- [Class Document — Apps Script](https://developers.google.com/apps-script/reference/document/document)
- [Class Body — Apps Script](https://developers.google.com/apps-script/reference/document/body)
- [Work with tabs — Apps Script](https://developers.google.com/apps-script/guides/docs/tabs)
- [Class DocumentTab](https://developers.google.com/apps-script/reference/document/document-tab) · [Class Tab](https://developers.google.com/apps-script/reference/document/tab)
