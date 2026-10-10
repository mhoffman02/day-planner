# GAS service index

Source: live-fetched `developers.google.com/apps-script/reference`
(2026-09-19). Each URL is relative to `https://developers.google.com`.

## Workspace services

| Service | Global object | Reference URL | Description |
|---|---|---|---|
| Calendar | `CalendarApp` | `/apps-script/reference/calendar` | Manage Calendar events and calendar properties. |
| Chat (advanced service) | — | `/apps-script/advanced/chat` | Access Google Chat conversations/messages. |
| Docs | `DocumentApp` | `/apps-script/reference/document` | Create/modify Google Docs documents. |
| Drive | `DriveApp` | `/apps-script/reference/drive` | Manage Drive files/folders. |
| Gmail | `GmailApp` | `/apps-script/reference/gmail` | Access/manage Gmail messages/labels. |
| Sheets | `SpreadsheetApp` | `/apps-script/reference/spreadsheet` | Work with Sheets/cell data. |
| Slides | `SlidesApp` | `/apps-script/reference/slides` | Create/edit Slides presentations. |
| Classroom (advanced service) | — | `/apps-script/advanced/classroom` | Manage Classroom courses/assignments. |
| Groups | `GroupsApp` | `/apps-script/reference/groups` | Manage Google Groups memberships. |
| Contacts | `ContactsApp` | `/apps-script/reference/contacts` | Access contact info/groups. |
| Tasks (advanced service) | — | `/apps-script/advanced/tasks` | Manage Google Tasks lists/items. |

## Utility services

| Service | Global object | Reference URL | Description |
|---|---|---|---|
| Base | `Logger`, `Browser`, `Session`, etc. | `/apps-script/reference/base` | Core utilities: logging, UI dialogs, script metadata, active-user info. |
| Cache | `CacheService` | `/apps-script/reference/cache` | Temporary data with automatic expiration (script/user/document scoped). |
| Lock | `LockService` | `/apps-script/reference/lock` | Coordinate concurrent script execution (mutex-style). |
| Properties | `PropertiesService` | `/apps-script/reference/properties` | Persistent key/value config (script/user/document scoped). Persistent config store (9KB per value). |
| Script | `ScriptApp` | `/apps-script/reference/script` | Triggers, auth info, web-app publishing. See `reference/triggers.md`. |
| HTML | `HtmlService` | `/apps-script/reference/html` | Web interfaces/dialogs. See `reference/html-service.md`. |
| Content | `ContentService` | `/apps-script/reference/content` | Text/JSON/XML web-app responses. See `reference/content-service.md`. |
| Mail | `MailApp` | `/apps-script/reference/mail` | Send email from a script (simpler, lower-quota alternative to GmailApp). |
| Charts | `Charts` | `/apps-script/reference/charts` | Generate chart images. |
| JDBC | `Jdbc` | `/apps-script/reference/jdbc` | Connect to external SQL databases. |
| URL Fetch | `UrlFetchApp` | `/apps-script/reference/url-fetch` | HTTP requests to external services. **See `gotchas.md` for its URL-length limit.** |
| Utilities | `Utilities` | `/apps-script/reference/utilities` | Encoding, hashing (incl. HMAC via `computeHmacSha256Signature`), compression, sleep. |
| XML | `XmlService` | `/apps-script/reference/xml-service` | Parse/generate XML. |
| Optimization | `LinearOptimizationService` | `/apps-script/reference/optimization` | Solve linear programming problems. |
| Maps | `Maps` | `/apps-script/reference/maps` | Geocode addresses, calculate directions. |
| Translate | `LanguageApp` | `/apps-script/reference/language` | Translate text between languages. |

## Notes

- "Advanced services" (Chat, Classroom, Tasks, and others like Admin
  SDK, BigQuery, Analytics) must be explicitly enabled per-project
  (`Services` panel in the editor, or `enabledAdvancedServices` in
  `appsscript.json`) before their global object exists — they're not
  available by default the way `SpreadsheetApp`/`DriveApp`/etc. are.
- Every Workspace/Utility service call site potentially requires
  declaring its OAuth scope in `appsscript.json`'s `oauthScopes` array
  once you move off Apps Script's auto-detected scope set — see
  `gotchas.md`'s "scope minimization" entry.
