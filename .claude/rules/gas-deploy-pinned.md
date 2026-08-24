# Always Deploy to the Pinned GAS Deployment ID

## The rule

The live Google Apps Script backend has one canonical deployment, pinned by ID:

```
AKfycbyAejUd5SWdt5dbmtSKYJZvwqQ2RHU-V3_mARJp3MDjMZ_jrlP0MfWnyTPYp6hVSyO4
```
(label: `day-planner-v01`, currently version @46). Its `/exec` URL is:
```
https://script.google.com/macros/s/AKfycbyAejUd5SWdt5dbmtSKYJZvwqQ2RHU-V3_mARJp3MDjMZ_jrlP0MfWnyTPYp6hVSyO4/exec
```

Every `clasp deploy` **must** include `-i AKfycbyAejUd5SWdt5dbmtSKYJZvwqQ2RHU-V3_mARJp3MDjMZ_jrlP0MfWnyTPYp6hVSyO4`
to update this deployment in place:

```bash
cd gas-app
clasp push --force
clasp deploy -i AKfycbyAejUd5SWdt5dbmtSKYJZvwqQ2RHU-V3_mARJp3MDjMZ_jrlP0MfWnyTPYp6hVSyO4 --description "Release notes here"
```

Never run `clasp deploy` without `-i` — that mints a brand-new deployment with a brand-new
`/exec` URL instead of updating this one.

## Why

`gh-pwa-shell` (the public loader at `mhoffman02.github.io/shell`) hardcodes this exact URL
as its "Launch Day Planner" quick-launch button and as the trust anchor once a user connects.
As of 2026-08-18, 24 stale deployments (each with its own distinct public URL) had
accumulated from historical `clasp deploy` calls that never passed `-i`; they were deleted via
`clasp undeploy <id>` and this one was pinned going forward. If a future deploy omits `-i`,
the shell's launch button silently starts serving a stale bundle from this now-orphaned
deployment while the real update goes live somewhere else.

## How to apply

- Any time you run `clasp deploy` in `gas-app/`, include `-i AKfycbyAejUd5SWdt5dbmtSKYJZvwqQ2RHU-V3_mARJp3MDjMZ_jrlP0MfWnyTPYp6hVSyO4`.
- If you ever need a *new* deployment ID (e.g. deliberately rotating for a security reason),
  update it in three places together: this file, the deploy command in `CLAUDE.md`, and the
  `KNOWN_APPS` entry / allowlist in `gh-pwa-shell/pwa.js`.
- `clasp deployments` (from `gas-app/`) lists current deployments — should normally show only
  this one plus the permanent, non-deletable `@HEAD` system deployment.
