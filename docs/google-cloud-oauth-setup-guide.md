# Google Cloud OAuth Client Setup — Step by Step

How to set up a Google Cloud project so a static, client-only web app can sign users in with
Google Identity Services (GIS) and call Calendar/Tasks/Drive/Docs REST APIs directly from the
browser — no backend server, no client secret in the app. Written from doing this for Day
Planner's `gas-removal-static-client` migration (2026-09-04); reuse for any future project that
needs "sign in with Google + call Google REST APIs from a static site."

## When to use this

- The app is static (GitHub Pages, S3, plain `index.html`) — no server to hold a client secret.
- It calls Google APIs (Calendar, Tasks, Drive, Docs, Sheets, etc.) as the signed-in user, from
  the browser, using a short-lived OAuth access token.
- Auth flow: GIS's `google.accounts.oauth2.initTokenClient` popup token flow — **not** the
  redirect-based Authorization Code flow, so there's no "Authorized redirect URI" to configure,
  only "Authorized JavaScript origins."

## Steps

### 1. Create the Google Cloud project

[console.cloud.google.com](https://console.cloud.google.com) → project picker (top left, next to
the logo) → **New Project**.
- Project name: anything descriptive — this is an internal label, not shown to end users on the
  consent screen (that's the separate "App name" field in step 3).
- Organization/location: leave as default ("No organization") for a personal Google account.
- No billing account is required for OAuth + the free tiers of Calendar/Tasks/Drive/Docs APIs.
- Click Create, then make sure the new project is **selected** in the top project picker before
  continuing — every later step operates on whichever project is currently selected, and it's
  easy to accidentally configure APIs/OAuth on the wrong project if you don't check this.

### 2. Enable the APIs you'll actually call — "Library" page

APIs & Services → **Library** (left nav, or the search bar at the top — searching "Google
Calendar API" etc. is faster than browsing categories). For each API the app calls directly:
search for it, open its page, click **Enable**. For Day Planner that was:
- Google Calendar API
- Google Tasks API
- Google Drive API
- Google Docs API

Each is a separate enable click — enabling one does not enable the others. Skip this and every
REST call to that API 403s with an "API not enabled for this project" error, even with valid
scopes and a valid token — this is a project-level switch, independent of OAuth scopes entirely.

### 3. Configure the OAuth consent screen — "Branding" page

APIs & Services → **OAuth consent screen**. Google's current UI reorganizes this whole area
under a left-nav group called **Google Auth Platform** with sub-pages: **Overview / Branding /
Audience / Data access / Clients**. The first time you land here for a new project it usually
walks you through an initial setup wizard (User type: for a personal Gmail account you'll only
see/need **External**; there is no "Internal" option unless the project belongs to a Google
Workspace org) — External is correct and fine to leave in **Testing** publish status indefinitely
for a personal/invite-only app (no Google verification review required as long as you stay under
~100 test users and don't request sensitive/restricted scopes at production scale).

On the **Branding** page, fill in:
- **App name** — shown to users on the consent popup itself (different from the Cloud project
  name in step 1).
- **User support email** — a dropdown of emails on your Google account; shown to users if they
  need help.
- **App logo** — *optional* while in Testing mode, but required if you ever move to In
  Production / submit for verification. If you add one: PNG or JPG, square, minimum 120×120px,
  max 1MB. Skippable for a testing-only personal app — the consent screen just shows a generic
  icon instead.
- **App domain** section — three optional-while-testing URL fields:
  - **Application home page**
  - **Application privacy policy link**
  - **Application terms of service link**
  These three are **not required to save the Branding page while in Testing**, but Google will
  require Privacy Policy + Terms of Service links before allowing **Publish** to Production later
  — and in practice the client-creation flow (step 6) can also prompt for them depending on
  scopes chosen. Cheapest to fill in now rather than backtrack: host two minimal static pages
  (see "Privacy/TOS pages" below) and link them here.
- **Authorized domain(s)** — the registrable domain your app's URL lives under (e.g. `github.io`
  for a `https://<user>.github.io/...` GitHub Pages URL). This is a domain, not a full URL — no
  `https://`, no path. Required for the Privacy/TOS links above to validate, since Google checks
  the links resolve under a domain you've claimed here.
- **Developer contact information** — an email, required, shown on the same-project audit log
  Google sends about consent screen changes (not shown to end users).

Save and continue through the wizard (it typically also re-shows Scopes and Test users as
sequential wizard steps the first time — those are steps 4/5 below; they're also independently
editable later from the Auth Platform left-nav without going through the wizard again).

### 4. Add scopes — "Data access" page

Under **Google Auth Platform → Data access** (not a flat "Scopes" tab on the old consent-screen
flow — this moved; see reference memory `reference_gcp_oauth_consent_scopes_location.md`), click
**Add or Remove Scopes** and select only what the app needs. Scope-minimize deliberately:
- Prefer `drive.file` (app-created files only) over the broad `drive` scope.
- Add `drive.readonly` only if you need to read files the app didn't create (e.g. resolving a
  pasted link's title) — keep it separate from `drive.file`, don't just widen to `drive`.
- Each additional scope is a line item a user sees on the consent popup and a thing Google's
  verification team reviews if you ever go past Testing mode — don't add "just in case" scopes.

### 5. Add test users — "Audience" page

While the app is in **Testing** publish status (the default, and fine indefinitely for a
personal/invite-only app), **only accounts explicitly listed here can sign in at all** — everyone
else gets an "app not verified / access blocked" error with no way through it.

Google Auth Platform → **Audience** → **Test users** → Add users → enter each Gmail address that
needs to sign in (your own account(s), anyone else you're inviting). This step is easy to forget
and is the single most common cause of "sign-in silently fails" during testing — check it first
if sign-in doesn't work.

### 6. Create the OAuth Client ID — "Clients" page

Google Auth Platform → **Clients** → **Create OAuth client**.
- Application type: **Web application**.
- Name: anything (internal label only, not user-facing).
- **Authorized JavaScript origins**: add every origin the app will actually run from — e.g.
  `http://localhost:3000` for local dev, `https://<user>.github.io` for the deployed Pages site.
  Must be exact scheme+host+port; no path, no trailing slash, no wildcard subdomains.
- **Authorized redirect URIs**: leave empty. The GIS token-popup flow used here doesn't redirect
  back to your app — there's nothing to put here. (Only needed for the separate Authorization
  Code / server-side flow, which this setup doesn't use.)

Click Create. Google shows a **Client ID** and a **Client Secret**.

### 7. Client ID vs. Client Secret — what to do with each

- **Client ID** (`...apps.googleusercontent.com`): not a secret. Safe to embed directly in
  browser JS / a public repo — it only identifies which app is asking, it can't authenticate
  anything by itself. This is the only value `initGoogleAuth(clientId)` needs.
  Prefer passing it through one call site (a config file, a build-time env var, or — for a quick
  manual test harness — a URL query param) rather than hardcoding it in multiple files (see
  `single-source-of-truth-constants.md`).
- **Client Secret**: **ignore it entirely for this flow.** It's for the server-side
  Authorization Code flow, where a backend exchanges a code for a token and must prove it's the
  real client. A pure client-side GIS token flow (`initTokenClient`) never sends or needs the
  secret — don't put it in the app, a repo, or anywhere client-reachable. If your Google Cloud
  Console UI generated one anyway (it does by default for "Web application" clients), just leave
  it in the console and never copy it into code.

### 8. Wire the Client ID into the app

Pass the Client ID to `google.accounts.oauth2.initTokenClient({ client_id, scope, callback })`
(or this repo's `initGoogleAuth(clientId)` wrapper in `src/googleAuth.js`). Request only the
scopes decided in step 4, space-separated.

### 9. Privacy/TOS pages, if you don't have them yet

Google requires real, reachable URLs before it will let you finish the Branding page (step 3).
For a solo/testing-stage app, two short static pages are enough — see this repo's
`docs/privacy.html` / `docs/terms.html` for a minimal template (what data is accessed, that
nothing is sold/shared, how to revoke access, a "Testing mode, invite-only" banner). Host them
wherever the app itself will be hosted (e.g. GitHub Pages) — they just need to resolve publicly.

### 10. Test it

Open the app from an **authorized origin** (step 6), signed in as an **authorized test user**
(step 5), and trigger sign-in. First click shows Google's real consent popup listing the
requested scopes; approving it returns an access token. If sign-in fails silently or with
"access blocked," the test-user list (step 5) is the first thing to check, then the origin match
(step 6), then whether the target API is enabled (step 2).

## Order that actually avoids rework

Enable APIs (2) → Branding incl. privacy/TOS links (3, 9) → scopes (4) → test users (5) → create
client (6) → wire in (8). Doing Branding before you have privacy/TOS pages live, or creating the
client before scopes are decided, just means going back and re-editing — cheaper to have pages 9
and 4 settled before you hit the fields that need them.

## Gotchas learned the hard way

- The "Clients" page vs. "OAuth consent screen" naming is inconsistent across Google's own UI
  versions — if you don't see a "Clients" page, look under the newer **Google Auth Platform**
  left-nav grouping (Overview / Branding / Audience / Data access / Clients), reached from
  APIs & Services → OAuth consent screen → whatever button leads to client creation ("You
  haven't configured any OAuth clients for this project yet" banner on Overview/Metrics).
- Scopes moved to a dedicated **Data access** page, not a tab directly on a single consent-screen
  form — see step 4.
- Nothing works for any account not on the **Audience → Test users** list while in Testing mode,
  regardless of how correct everything else is — see step 5.
- Client Secret is a red herring for this flow — see step 7. Do not try to "figure out where it
  goes"; it goes nowhere in a static client-only app.
- Double-check the **project picker** (step 1) after creating a new project — APIs enabled (step
  2) and OAuth config (steps 3-6) are all per-project, and it's easy to keep clicking around in a
  pre-existing project by mistake if the picker didn't actually switch.
- The **App logo** (step 3) is skippable entirely for a Testing-only app — don't spend time
  designing one unless/until you actually submit for Google verification.
