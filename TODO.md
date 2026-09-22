# Active Tasks (TODO)

## Phase 4: Feature & Bugfix Backporting

- [ ] **Universal Search**:
  - Anchored Ctrl+K modal/dropdown indexing Tasks, Appointments, and Notes across both daily records and monthly Google Docs archives.
  - Fast client-side index querying with keyboard navigation (`↑`/`↓`/`Enter`/`Esc`).

## Phase 5: Verification & Clasp Deployment Gate

- [ ] **Verification & Clasp Deployment Gate**:
  - Full test suite: `npm test` passing 100% with no skips.
  - Linter: `npm run lint` clean across `gas-app/`, `src/`, `tools/`.
  - Check safe chars: verify no `//` comment truncation risks.
  - Verify local dev server: `npm start` runs at `http://localhost:3000`.
  - Deploy to GAS development endpoint via `clasp push` and run `/self-test` diagnostic suite.
