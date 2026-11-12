# One Definition per Cross-File Constant

A value (version, cache name, ID, URL pattern, timeout) needed by more than one file or runtime (client/server, UI/engine) is defined once; consumers read it. No hand-synced second literal. One-off local literals are fine.

Examples: scopes live only in `gas-app/appsscript.json`; priority groups, task statuses, hour-grid bounds live in `src/taskEngine.js` / `src/calendarEngine.js`.
