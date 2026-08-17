# 📖 Day Planner

A high-efficiency single-page digital binder application styled in classic Day Planner aesthetic (forest/teal ruling, cream background, serif headers). It bridges Day Planner productivity methodology with Google Workspace APIs (Calendar, Tasks, Drive JSON) featuring full 2-Way Synchronization and offline-first PWA capabilities.

---

## 🚀 Live Access & Deployment Links

| Environment | Access Link | Description |
| :--- | :--- | :--- |
| **Universal PWA Shell (GitHub Pages)** | [mhoffman02.github.io/shell/?app=day-planner](https://mhoffman02.github.io/shell/?app=day-planner) | Generic PWA Shell Loader (Only host served on GH Pages) |
| **GAS Web App (Owner /dev)** | [GAS Script Execution](https://script.google.com/macros/s/1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W/dev) | Direct Google Apps Script Endpoint |
| **Local Preview Server** | `http://localhost:3000` | Local Node.js Dev Server (`npm start`) |

> **Note on GitHub Pages:** By design, the `day-planner` repository does **not** serve a standalone GitHub Pages site (`https://mhoffman02.github.io/day-planner/` returns 404 by design to protect proprietary code and private data). All PWA access is routed through the generic, public **Universal Shell** at `https://mhoffman02.github.io/shell/?app=day-planner`.

---

## 📋 Instructions

### 1. Accessing the Day Planner App on GitHub Pages

The Day Planner utilizes a privacy-preserving **Universal PWA Shell** architecture: the public GitHub Pages host only serves a minimal, generic shell (`/shell/`), while your binder templates, notes, and task data remain privately cached on your device and inside your Google Workspace account.

#### A. Universal Shell Deployment
The universal shell is served centrally from:
👉 **`https://mhoffman02.github.io/shell/?app=day-planner`**

---

#### B. First-Time Access & Setup
1. **Open the Shell URL**: Visit [https://mhoffman02.github.io/shell/?app=day-planner](https://mhoffman02.github.io/shell/?app=day-planner) in Chrome, Edge, Safari, or your mobile browser.
2. **Connect your Google Apps Script Backend**:
   - On your first visit, enter your private GAS Web App deployment URL:  
     `https://script.google.com/macros/s/.../exec`
   - The shell loader downloads your versioned application bundle via CORS and stores it in browser `IndexedDB`.
3. **Install as Standalone PWA (Recommended)**:
   - **Desktop (Chrome/Edge)**: Click the **Install** icon (🖥️ / ➕) in the address bar.
   - **Mobile (iOS Safari)**: Tap the **Share** button $\to$ **Add to Home Screen** (📲).
   - **Mobile (Android Chrome)**: Tap the menu $\dots \to$ **Install app** / **Add to Home screen**.

---

#### C. Subsequent Visits & Offline Usage (Airplane Mode)
1. **Launch Directly**: Open [https://mhoffman02.github.io/shell/?app=day-planner](https://mhoffman02.github.io/shell/?app=day-planner) or launch the installed Day Planner app directly from your Desktop, Dock, or Home Screen.
2. **Instant 0ms Cold Start**: The app renders instantly from local `IndexedDB` cache with zero latency, even with no network connection (100% Airplane Mode ready).
3. **Automated 2-Way Sync & Hot Updates**:
   - When an internet connection is detected, the shell automatically validates its content hash against Google Apps Script (`?action=bundle`).
   - Edits made offline (tasks, notes, appointments) are stored in the local outbox and synced to Google Tasks and Google Calendar upon reconnection.
   - Background polling updates your workspace silently every 5 minutes or whenever you switch back to the browser tab.

---

### 2. Local Development & Testing

1. **Install Dependencies & Run Tests**:
   ```bash
   npm test
   ```
   *Runs all 64 unit tests across 18 test suites.*

2. **Start Local Dev Server**:
   ```bash
   npm start
   ```
   *Opens the local preview environment at `http://localhost:3000`.*

---

### 3. Deploying Updates to Google Apps Script

To push local code changes in `gas-app/` to the live Google Apps Script project:

```bash
cd gas-app
clasp push --force
clasp deploy --description "Release Update Notes"
```

---

## 🏛️ Architecture & Data Storage

- **UI & Interaction**: Vanilla CSS + Alpine.js (Classic Day Planner parchment `#fcfbfa`, teal `#2d6a5a`, and serif typography).
- **Daily Tasks**: Google Tasks API (`[A1]`–`[C9]` priority sequence sorting and status transitions: `✓`, `→`, `X`, `G/✓`, `•`).
- **Calendar & Schedule**: Google Calendar API with 7:00 AM – 7:00 PM time grid, Google Meet links, and bidirectional time shift synchronization.
- **Daily Notes & Index**: Partitioned monthly JSON files stored in Google Drive under `Day Planner/notes-YYYY-MM.json` with `#index` registry search.
- **Client Cache**: Native browser `IndexedDB` with offline outbox queue and Stale-While-Revalidate (SWR) cache validation.

---

## 🔒 Security & Least-Privilege Scopes

Broad `drive` and `documents` scopes are explicitly disallowed. The application requests only scoped permissions:
- `https://www.googleapis.com/auth/drive.file` (Sandboxed to `/Day Planner/` folder)
- `https://www.googleapis.com/auth/tasks`
- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/script.scriptapp`
