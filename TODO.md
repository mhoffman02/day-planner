# Active Tasks (TODO)

## Phase 5: Verification & Clasp Deployment Gate

- [ ] **Phase 5 Verification & Local Smoke Testing**:
  - Full test suite: `npm test` passing 100% with no skips.
  - Linter: `npm run lint` clean across `gas-app/`, `src/`, `tools/`.
  - Check safe chars: verify no `//` comment truncation risks.
  - Verify local dev server: `npm start` runs at `http://localhost:3000`.
- [ ] **Phase 5 Clasp Deployment Gate**:
  - Deploy to GAS development endpoint via `clasp push`.
  - Run `/self-test` diagnostic suite to verify live Google Workspace service integrations.

