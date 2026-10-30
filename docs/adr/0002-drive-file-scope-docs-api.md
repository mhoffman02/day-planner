# 0002 `drive.file` only; Google Docs via the Advanced Service

**Status:** Accepted 2026-09-27.

**Context:** The broad `drive` and `documents` scopes trigger stricter OAuth verification and read every
file the user owns. `DocumentApp` accepts only the `documents` scope.

**Decision:** The manifest (`gas-app/appsscript.json`) requests `drive.file`, never `drive` or `documents`.
All Docs reads and writes go through `Docs.Documents.get/batchUpdate/create`, which works under
`drive.file`.

**Consequences:** The app sees only files it created or the user opened with it. Linking the GCP project
later broke `drive.file` grants on older app files (HOME, 2026-10-10). A new Advanced Service needs the IDE
Services (+) click, not just a manifest entry.
