# 📖 Day Planner

A high-efficiency single-page digital binder application styled in classic Day Planner aesthetic (forest/teal ruling, cream background, serif headers). It bridges Day Planner productivity methodology with Google Workspace APIs (Calendar, Tasks, Drive JSON) featuring full 2-Way Synchronization and offline-first PWA capabilities.

A 100% static client-only app: no server-side backend. The browser talks directly to Google's Calendar/Tasks/Drive/Docs REST APIs, authenticated via client-side Google Identity Services OAuth. Hosted as a plain static site on GitHub Pages.

---

## 🚀 Live Access & Deployment Links

| Environment | Access Link | Description |
| :--- | :--- | :--- |
| **Live App (GitHub Pages)** | [mhoffman02.github.io/day-planner](https://mhoffman02.github.io/day-planner/) | Static PWA, served directly — no loader/shell |
| **Local Preview Server** | `http://localhost:3000` | Local Node.js Dev Server (`npm start`) |

---

## 📋 Instructions

### 1. Accessing the Day Planner App

1. **Open the app**: Visit [https://mhoffman02.github.io/day-planner/](https://mhoffman02.github.io/day-planner/) in Chrome, Edge, Safari, or your mobile browser.
2. **Sign in with Google**: Grant the requested scopes (Calendar events, Tasks, `drive.file` for app-created Drive files). No setup step or backend URL to enter — the app talks to Google's APIs directly from your browser.
3. **Install as Standalone PWA (Recommended)**:
   - **Desktop (Chrome/Edge)**: Click the **Install** icon (🖥️ / ➕) in the address bar.
   - **Mobile (iOS Safari)**: Tap the **Share** button → **Add to Home Screen** (📲).
   - **Mobile (Android Chrome)**: Tap the menu … → **Install app** / **Add to Home screen**.

### 2. Offline Usage

- **Instant 0ms Cold Start**: The app renders instantly from local `IndexedDB` cache with zero latency, even with no network connection (100% Airplane Mode ready).
- **Offline outbox**: Edits made offline (tasks, notes, appointments) are queued locally and synced to Google Tasks/Calendar/Drive once the connection returns and you're signed in.
- A service worker (`sw.js`) caches the app shell for repeat visits; `tools/update-sw-cache-version.js` keeps its cache-busting version in sync with the cached asset contents.

### 3. Local Development & Testing

1. **Run tests**:
   ```bash
   npm test
   ```
2. **Start local dev server**:
   ```bash
   npm start
   ```
   Opens the local preview environment at `http://localhost:3000`, using mock Google data (no OAuth needed for local dev).

See `CLAUDE.md` for the full architecture writeup and `docs/google-cloud-oauth-setup-guide.md` if you need to stand up your own OAuth client ID for a fork/deploy.

---

## 🏛️ Architecture & Data Storage

- **UI & Interaction**: Vanilla CSS + Alpine.js (Classic Day Planner parchment `#fcfbfa`, teal `#2d6a5a`, and serif typography).
- **Auth**: Google Identity Services (GIS) OAuth, client-side only — no server ever sees your token.
- **Daily Tasks**: Google Tasks API (`[A1]`–`[C9]` priority sequence sorting and status transitions: `✓`, `→`, `X`, `D/✓`, `•`).
- **Calendar & Schedule**: Google Calendar API with 7:00 AM – 7:00 PM time grid, Google Meet links, and bidirectional time shift synchronization.
- **Daily Notes & Index**: Partitioned monthly JSON files stored in Google Drive under `Day Planner/notes-YYYY-MM.json` with `#index` registry search.
- **Client Cache**: Native browser `IndexedDB` with offline outbox queue and Stale-While-Revalidate (SWR) cache validation.

---

## 🔒 Security & Least-Privilege Scopes

Broad `drive` and `documents` scopes are explicitly disallowed. The application requests only scoped permissions:
- `https://www.googleapis.com/auth/drive.file` (sandboxed to app-created files)
- `https://www.googleapis.com/auth/drive.readonly` (read-only, only to resolve the title of a pasted Docs/Sheets/Slides/Drive link)
- `https://www.googleapis.com/auth/calendar.events` (events only, never whole-calendar management)
- `https://www.googleapis.com/auth/tasks`
- `https://www.googleapis.com/auth/userinfo.email`
