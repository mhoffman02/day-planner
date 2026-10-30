# Architecture Decision Records

One file per decision that would be expensive to reverse or easy to undo by accident. Format (Nygard):
**Status**, **Context**, **Decision**, **Consequences**. A reversal adds a new ADR marked
`Supersedes NNNN`; the old one's status becomes `Superseded by NNNN`. Never edit history away.

| # | Decision | Status |
| :-- | :-- | :-- |
| [0001](0001-pure-gas-web-app.md) | Stay a pure Google Apps Script web app | Accepted 2026-09-09 |
| [0002](0002-drive-file-scope-docs-api.md) | `drive.file` only; Docs via the Advanced Service | Accepted 2026-09-27 |
| [0003](0003-one-namespace-per-gs-file.md) | No globals: one frozen IIFE namespace per `.gs` file | Accepted 2026-10-10 |
| [0004](0004-engines-built-from-src.md) | Server engines are built from tested `src/integration` | Accepted |
| [0005](0005-js-with-v-validation-not-typescript.md) | JavaScript + `v_` boundary validation, not TypeScript | Accepted 2026-10-30 |
| [0006](0006-live-deploy-gate.md) | HOME v1 moves only after a live `/dev` load | Accepted 2026-10-30 |
