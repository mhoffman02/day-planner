/**
 * @file shellLoader.js
 * @description Day Planner minimal PWA Shell Loader. Handles offline bundle caching in IndexedDB,
 * 100% offline cold starts (Airplane Mode), hot-updates from private Google Apps Script backend, and seamless DOM mounting.
 */

const DB_NAME = 'DayPlannerShellDB';
const DB_VERSION = 1;
const STORE_NAME = 'bundles';
const BUNDLE_KEY = 'active_bundle';
const URL_STORAGE_KEY = 'dayPlannerGasUrl';

// 1. IndexedDB Helper for Storing/Loading the Private Application Bundle
export function openShellDb() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (evt) => {
        const db = evt.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

export async function getCachedBundle() {
  try {
    const db = await openShellDb();
    if (!db) {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(BUNDLE_KEY) : null;
      return raw ? JSON.parse(raw) : null;
    }
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(BUNDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    console.warn('Could not read cached bundle:', e);
    return null;
  }
}

export async function saveCachedBundle(bundleObj) {
  try {
    const db = await openShellDb();
    if (!db) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(BUNDLE_KEY, JSON.stringify(bundleObj));
      }
      return;
    }
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(bundleObj, BUNDLE_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    console.warn('Could not save bundle cache:', e);
  }
}

// 2. DOM Mounting Engine: Injects Styles, Markup, and Scripts
export function mountBundle(bundleData) {
  if (typeof document === 'undefined') return;
  const root = document.getElementById('app-root');
  if (!root) return;

  // Remove loading skeleton if present
  const skeleton = document.getElementById('shell-skeleton');
  if (skeleton && typeof skeleton.remove === 'function') skeleton.remove();

  // Inject Stylesheet if bundle has styles
  if (bundleData.bundle && bundleData.bundle.styles) {
    let styleTag = document.getElementById('day-planner-bundle-styles');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'day-planner-bundle-styles';
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = bundleData.bundle.styles;
  }

  // Inject Markup into app root
  if (bundleData.bundle && bundleData.bundle.html) {
    let htmlToMount = bundleData.bundle.html;
    if (htmlToMount.includes('<body') && htmlToMount.includes('</body>')) {
      const match = htmlToMount.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      if (match && match[1]) {
        htmlToMount = match[1];
      }
    }
    root.innerHTML = htmlToMount;
  }

  // Inject and Execute Script
  if (bundleData.bundle && bundleData.bundle.script) {
    const existingScript = document.getElementById('day-planner-bundle-script');
    if (existingScript && typeof existingScript.remove === 'function') existingScript.remove();

    const scriptTag = document.createElement('script');
    scriptTag.id = 'day-planner-bundle-script';
    let cleanScript = bundleData.bundle.script;
    cleanScript = cleanScript.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    scriptTag.textContent = cleanScript;
    document.body.appendChild(scriptTag);
  }

  // Trigger Alpine.js initialization if present on window
  if (typeof window !== 'undefined' && window.Alpine && typeof window.Alpine.start === 'function') {
    try {
      window.Alpine.start();
    } catch (e) {
      // Alpine already running
    }
  }
}

// 3. Remote Sync & Hot-Update Engine
export async function checkRemoteUpdate(gasUrl, currentHash) {
  if (!gasUrl || (typeof navigator !== 'undefined' && !navigator.onLine)) return null;
  try {
    const fetchUrl = `${gasUrl}${gasUrl.includes('?') ? '&' : '?'}action=bundle&currentHash=${encodeURIComponent(currentHash || '')}`;
    const res = await fetch(fetchUrl);
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('Network update check skipped (offline or CORS blocked):', err);
    return null;
  }
}

// 4. Initial Setup Screen (When No URL & No Cached Bundle)
export function renderSetupScreen() {
  if (typeof document === 'undefined') return;
  const root = document.getElementById('app-root');
  if (!root) return;

  root.innerHTML = `
    <div style="font-family: serif; max-width: 580px; margin: 40px auto; padding: 32px; background: #fcfbfa; border: 2px solid #1c2d27; border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,0.15); color: #1c2d27;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="margin: 0 0 8px 0; color: #1c2d27; font-size: 1.6rem; letter-spacing: 0.5px;">Classic Franklin Covey Day Planner</h2>
        <p style="margin: 0; font-size: 0.95rem; color: #5a5751;">PWA Shell & Offline Secure Container</p>
      </div>

      <p style="font-size: 0.95rem; line-height: 1.5; margin-bottom: 16px;">
        Connect your private Google Apps Script Web App to download your planner bundle and enable 100% offline access.
      </p>

      <form id="shell-setup-form" onsubmit="return false;" style="display: flex; flex-direction: column; gap: 14px;">
        <label style="font-size: 0.9rem; font-weight: bold; color: #1c2d27;">
          Google Apps Script Web App URL:
          <input type="url" id="gas-url-input" required placeholder="https://script.google.com/macros/s/.../exec"
            style="width: 100%; box-sizing: border-box; margin-top: 6px; padding: 10px 12px; font-family: monospace; font-size: 0.85rem; border: 1px solid #1c2d27; border-radius: 4px; background: #fff;" />
        </label>

        <div style="display: flex; gap: 10px; margin-top: 10px;">
          <button type="button" id="btn-connect-gas" style="flex: 1; padding: 12px 18px; background: #1c2d27; color: #fff; border: none; border-radius: 4px; font-size: 0.95rem; font-weight: bold; cursor: pointer;">
            🚀 Connect & Download Planner
          </button>
        </div>
        <div id="shell-status-msg" style="font-size: 0.85rem; color: #b3392f; margin-top: 6px;"></div>
      </form>

      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #dcd8cf; font-size: 0.82rem; color: #736e65; line-height: 1.4;">
        🔒 <b>100% Private:</b> Your data and code live exclusively in your private Google account. This shell caches the app locally on your device for instant offline use.
      </div>
    </div>
  `;

  document.getElementById('btn-connect-gas')?.addEventListener('click', async () => {
    const input = document.getElementById('gas-url-input');
    const msg = document.getElementById('shell-status-msg');
    const url = input?.value.trim();
    if (!url || !url.startsWith('http')) {
      if (msg) msg.textContent = 'Please enter a valid Google Apps Script Web App URL.';
      return;
    }

    if (msg) {
      msg.style.color = '#1c2d27';
      msg.textContent = '⏳ Downloading and verifying Day Planner bundle...';
    }

    localStorage.setItem(URL_STORAGE_KEY, url);
    const update = await checkRemoteUpdate(url, null);
    if (update && update.bundle) {
      await saveCachedBundle(update);
      mountBundle(update);
    } else {
      if (msg) {
        msg.style.color = '#b3392f';
        msg.textContent = '⚠️ Could not download bundle. Check URL and ensure Web App is deployed with "Anyone" access.';
      }
    }
  });
}

// 5. Main Boot Sequence
export async function boot() {
  if (typeof window === 'undefined') return;

  // A. Register Service Worker for Offline Cold-Start
  if ('serviceWorker' in navigator) {
    try {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.log('SW registration note:', err);
      });
    } catch (e) {
      // Ignore
    }
  }

  // B. Check URL query parameters (e.g. ?gasUrl=...)
  const params = new URLSearchParams(window.location.search);
  const paramUrl = params.get('gasUrl');
  if (paramUrl) {
    localStorage.setItem(URL_STORAGE_KEY, paramUrl);
  }

  const gasUrl = localStorage.getItem(URL_STORAGE_KEY);
  const cached = await getCachedBundle();

  // C. If cached bundle exists, MOUNT IMMEDIATELY (0ms Offline Cold-Start!)
  if (cached && cached.bundle) {
    mountBundle(cached);

    // Check for hot updates in background if online
    if (navigator.onLine && gasUrl) {
      checkRemoteUpdate(gasUrl, cached.hash).then(async (update) => {
        if (update && !update.upToDate && update.bundle) {
          await saveCachedBundle(update);
          console.log('📦 New Day Planner bundle v' + update.version + ' cached for next reload.');
          if (window.showToast) {
            window.showToast('Day Planner updated (v' + update.version + '). Reload to apply changes.', 'info', 8000, 'Update Available');
          }
        }
      });
    }
    return;
  }

  // D. If no cached bundle, try downloading immediately if gasUrl is configured
  if (gasUrl && navigator.onLine) {
    const update = await checkRemoteUpdate(gasUrl, null);
    if (update && update.bundle) {
      await saveCachedBundle(update);
      mountBundle(update);
      return;
    }
  }

  // E. Fallback to Initial Setup Screen
  renderSetupScreen();
}

// Run on DOMContentLoaded in browser environments
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}
