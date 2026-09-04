/**
 * @file googleAuth.test.js
 * @description Unit tests for the Google Identity Services (GIS) token client wrapper that
 * replaces GAS's implicit session auth for the client-only REST migration.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Fakes window.google.accounts.oauth2 well enough to drive googleAuth.js without a real
 * network call or browser: initTokenClient() captures the config, requestAccessToken()
 * synchronously invokes the client's current callback with a scripted response.
 */
function installFakeGis({ responses = [] } = {}) {
  let callIndex = 0;
  const capturedConfigs = [];
  const revokedTokens = [];

  const tokenClient = {
    callback: () => {},
    requestAccessToken() {
      const response = responses[Math.min(callIndex, responses.length - 1)];
      callIndex++;
      tokenClient.callback(response);
    }
  };

  globalThis.window = {
    google: {
      accounts: {
        oauth2: {
          initTokenClient(config) {
            capturedConfigs.push(config);
            return tokenClient;
          },
          revoke(token, cb) {
            revokedTokens.push(token);
            cb();
          }
        }
      }
    }
  };

  return { capturedConfigs, revokedTokens, tokenClient };
}

function uninstallFakeGis() {
  delete globalThis.window;
  delete globalThis.sessionStorage;
}

function installFakeSessionStorage() {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
  return store;
}

describe('googleAuth', () => {
  let googleAuth;

  beforeEach(async () => {
    // Fresh module instance per test so cachedToken/tokenClient module state doesn't leak
    // between tests (ESM modules are cached by resolved URL, so bust it with a query param).
    googleAuth = await import(`../src/googleAuth.js?t=${Date.now()}-${Math.random()}`);
  });

  afterEach(() => {
    uninstallFakeGis();
  });

  it('throws if initGoogleAuth is not given a client id', async () => {
    installFakeGis();
    await assert.rejects(() => googleAuth.initGoogleAuth(), /clientId is required/);
  });

  it('requests the full documented scope list on init', async () => {
    const { capturedConfigs } = installFakeGis();
    await googleAuth.initGoogleAuth('test-client-id');
    assert.equal(capturedConfigs.length, 1);
    assert.equal(capturedConfigs[0].client_id, 'test-client-id');
    assert.equal(capturedConfigs[0].scope, googleAuth.GOOGLE_AUTH_SCOPES);
    assert.match(googleAuth.GOOGLE_AUTH_SCOPES, /drive\.file/);
    assert.match(googleAuth.GOOGLE_AUTH_SCOPES, /drive\.readonly/);
    assert.match(googleAuth.GOOGLE_AUTH_SCOPES, /\bcalendar\b/);
    assert.match(googleAuth.GOOGLE_AUTH_SCOPES, /\btasks\b/);
    assert.match(googleAuth.GOOGLE_AUTH_SCOPES, /\bdocuments\b/);
  });

  it('signIn() resolves with the access token and getAccessToken() then returns it', async () => {
    installFakeGis({ responses: [{ access_token: 'tok_abc', expires_in: 3600 }] });
    installFakeSessionStorage();
    await googleAuth.initGoogleAuth('test-client-id');

    assert.equal(googleAuth.isSignedIn(), false);
    const token = await googleAuth.signIn();
    assert.equal(token, 'tok_abc');
    assert.equal(googleAuth.getAccessToken(), 'tok_abc');
    assert.equal(googleAuth.isSignedIn(), true);
  });

  it('signIn() rejects when GIS returns an error response', async () => {
    installFakeGis({ responses: [{ error: 'access_denied', error_description: 'user declined' }] });
    installFakeSessionStorage();
    await googleAuth.initGoogleAuth('test-client-id');

    await assert.rejects(() => googleAuth.signIn(), /access_denied/);
    assert.equal(googleAuth.getAccessToken(), null);
  });

  it('ensureAccessToken() returns the cached token without prompting again', async () => {
    installFakeGis({ responses: [{ access_token: 'tok_abc', expires_in: 3600 }] });
    installFakeSessionStorage();
    await googleAuth.initGoogleAuth('test-client-id');
    await googleAuth.signIn();

    const token = await googleAuth.ensureAccessToken();
    assert.equal(token, 'tok_abc');
  });

  it('ensureAccessToken() tries a silent refresh, then falls back to interactive sign-in', async () => {
    // First requestAccessToken() call (the silent one) errors; the second (interactive) succeeds.
    const { tokenClient } = installFakeGis({
      responses: [
        { error: 'interaction_required' },
        { access_token: 'tok_fresh', expires_in: 3600 }
      ]
    });
    installFakeSessionStorage();
    await googleAuth.initGoogleAuth('test-client-id');

    const token = await googleAuth.ensureAccessToken();
    assert.equal(token, 'tok_fresh');
    assert.equal(googleAuth.getAccessToken(), 'tok_fresh');
    void tokenClient;
  });

  it('getAccessToken() returns null once the token has expired', async () => {
    installFakeGis({ responses: [{ access_token: 'tok_abc', expires_in: -1 }] });
    installFakeSessionStorage();
    await googleAuth.initGoogleAuth('test-client-id');
    await googleAuth.signIn();

    assert.equal(googleAuth.getAccessToken(), null);
    assert.equal(googleAuth.isSignedIn(), false);
  });

  it('signOut() clears the token and revokes it with Google', async () => {
    const { revokedTokens } = installFakeGis({ responses: [{ access_token: 'tok_abc', expires_in: 3600 }] });
    installFakeSessionStorage();
    await googleAuth.initGoogleAuth('test-client-id');
    await googleAuth.signIn();

    googleAuth.signOut();
    assert.equal(googleAuth.getAccessToken(), null);
    assert.equal(googleAuth.isSignedIn(), false);
    assert.deepEqual(revokedTokens, ['tok_abc']);
  });

  it('signOut() is a no-op (no throw, no revoke call) when already signed out', async () => {
    const { revokedTokens } = installFakeGis();
    installFakeSessionStorage();
    await googleAuth.initGoogleAuth('test-client-id');

    assert.doesNotThrow(() => googleAuth.signOut());
    assert.deepEqual(revokedTokens, []);
  });

  it('onAuthStateChanged() notifies subscribers on sign-in and sign-out, and unsubscribe stops notifications', async () => {
    installFakeGis({ responses: [{ access_token: 'tok_abc', expires_in: 3600 }] });
    installFakeSessionStorage();
    await googleAuth.initGoogleAuth('test-client-id');

    const events = [];
    const unsubscribe = googleAuth.onAuthStateChanged((signedIn) => events.push(signedIn));

    await googleAuth.signIn();
    googleAuth.signOut();
    unsubscribe();
    // Re-sign-in after unsubscribing should not be observed.
    installFakeGis({ responses: [{ access_token: 'tok_2', expires_in: 3600 }] });
    await googleAuth.initGoogleAuth('test-client-id');
    await googleAuth.signIn();

    assert.deepEqual(events, [true, false]);
  });

  it('signIn() rejects with a clear error if initGoogleAuth was never called', async () => {
    installFakeGis();
    await assert.rejects(() => googleAuth.signIn(), /initGoogleAuth/);
  });
});
