/**
 * @file googleAuth.js
 * @description Client-side Google OAuth via Google Identity Services (GIS) — the browser-obtained
 * access token that replaces GAS's implicit per-user session auth now that the app talks to
 * Google's REST APIs directly instead of through google.script.run. See the "eliminate GAS
 * server-side" migration plan for why this exists; src/gasBridge.js is the consumer.
 */

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
// Session-scoped, not localStorage: this holds a live bearer credential, so its exposure
// window should end when the tab closes, same spirit as GAS's own short-lived session.
const TOKEN_STORAGE_KEY = 'dayPlannerGoogleAuthToken';

// Scope-minimization mirrors the existing drive.file/drive.readonly split in
// gas-app/appsscript.json (drive.readonly is requested *only* because resolveLinkTitle needs to
// read the title of a pasted Doc/Sheet/Slide/Form/Drive link the app didn't create — drive.file
// alone only covers app-created files). `documents` is net-new versus appsscript.json: GAS's
// implicit execution grant covered DocumentApp's agenda-doc creation for free; calling the Docs
// REST API directly requires requesting it explicitly.
export const GOOGLE_AUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/userinfo.email'
].join(' ');

let tokenClient = null;
let cachedToken = null; // { accessToken: string, expiresAt: number (epoch ms) } | null
const listeners = new Set();

function hasGis() {
  return typeof window !== 'undefined' && Boolean(window.google?.accounts?.oauth2);
}

function notifyListeners() {
  for (const cb of listeners) cb(isSignedIn());
}

function loadStoredToken() {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.accessToken || !parsed.expiresAt) return null;
    if (parsed.expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function storeToken(token) {
  cachedToken = token;
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (token) sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
    else sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // sessionStorage unavailable (private browsing, quota) — the in-memory cache above still
    // works for the rest of this page load, it just won't survive a reload.
  }
}

function loadGisScript() {
  return new Promise((resolve, reject) => {
    if (hasGis()) {
      resolve();
      return;
    }
    if (typeof document === 'undefined') {
      reject(new Error('googleAuth: no document available to load the Google Identity Services script'));
      return;
    }
    const existing = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services script')));
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script'));
    document.head.appendChild(script);
  });
}

/**
 * Loads the GIS script (if needed) and creates the token client. Must be called once, before
 * signIn()/ensureAccessToken(), with an OAuth 2.0 Web client ID from Google Cloud Console
 * (Authorized JavaScript origins must include this app's origin).
 * @param {string} clientId
 * @returns {Promise<void>}
 */
export async function initGoogleAuth(clientId) {
  if (!clientId) throw new Error('googleAuth.initGoogleAuth: clientId is required');
  cachedToken = loadStoredToken();
  await loadGisScript();
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GOOGLE_AUTH_SCOPES,
    callback: () => {} // replaced per-request in requestToken()
  });
}

function requestToken(prompt) {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error('googleAuth: call initGoogleAuth(clientId) before signing in'));
      return;
    }
    tokenClient.callback = (response) => {
      if (response.error) {
        reject(new Error(`googleAuth: ${response.error}${response.error_description ? ' — ' + response.error_description : ''}`));
        return;
      }
      const token = {
        accessToken: response.access_token,
        expiresAt: Date.now() + (Number(response.expires_in) || 3600) * 1000
      };
      storeToken(token);
      notifyListeners();
      resolve(token.accessToken);
    };
    tokenClient.requestAccessToken({ prompt });
  });
}

/** Interactive sign-in — always shows the Google consent/account picker. */
export async function signIn() {
  return requestToken('consent');
}

/** Clears the local token and revokes it with Google. Safe to call when already signed out. */
export function signOut() {
  const token = cachedToken;
  storeToken(null);
  notifyListeners();
  if (token?.accessToken && hasGis() && window.google.accounts.oauth2.revoke) {
    window.google.accounts.oauth2.revoke(token.accessToken, () => {});
  }
}

/** Returns the cached access token if it hasn't expired, else null. Never triggers a prompt. */
export function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.accessToken;
  const stored = loadStoredToken();
  if (stored) {
    cachedToken = stored;
    return stored.accessToken;
  }
  return null;
}

/**
 * Returns a valid access token, refreshing silently (no visible popup) if the cached one is
 * missing/expired but the browser still has an active Google session, and only falling back to
 * an interactive prompt if that silent attempt fails.
 * @returns {Promise<string>}
 */
export async function ensureAccessToken() {
  const existing = getAccessToken();
  if (existing) return existing;
  try {
    return await requestToken('');
  } catch {
    return signIn();
  }
}

export function isSignedIn() {
  return Boolean(getAccessToken());
}

/**
 * Subscribes to sign-in/sign-out transitions (e.g. for app.js's auth UI).
 * @param {(signedIn: boolean) => void} callback
 * @returns {() => void} Unsubscribe function.
 */
export function onAuthStateChanged(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
