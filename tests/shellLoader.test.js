/**
 * @file shellLoader.test.js
 * @description Unit tests for PWA Shell Loader, bundle caching, and DOM mounting engine.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getCachedBundle, saveCachedBundle, mountBundle, checkRemoteUpdate, boot } from '../src/shellLoader.js';

describe('PWA Shell Loader Engine Tests', () => {
  beforeEach(() => {
    // Setup in-memory mock localStorage
    const store = {};
    global.localStorage = {
      getItem: (key) => store[key] || null,
      setItem: (key, val) => { store[key] = String(val); },
      removeItem: (key) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); }
    };

    // Setup minimal DOM mock
    global.document = {
      head: {
        appendChild: (el) => el
      },
      body: {
        appendChild: (el) => el
      },
      getElementById: (id) => {
        if (id === 'app-root') {
          return {
            id: 'app-root',
            innerHTML: '',
            children: []
          };
        }
        return null;
      },
      createElement: (tag) => ({
        tagName: tag.toUpperCase(),
        id: '',
        textContent: '',
        remove: () => {}
      })
    };
  });

  it('should save and retrieve application bundle from fallback storage', async () => {
    const mockBundle = {
      version: '1.2.0',
      hash: 'test-hash-12345',
      bundle: {
        styles: '.test-class { color: #1c2d27; }',
        html: '<div class="test-class">Digital Binder</div>',
        script: 'console.log("App mounted");'
      }
    };

    await saveCachedBundle(mockBundle);
    const retrieved = await getCachedBundle();

    assert.ok(retrieved, 'Should retrieve stored bundle');
    assert.equal(retrieved.version, '1.2.0');
    assert.equal(retrieved.hash, 'test-hash-12345');
    assert.equal(retrieved.bundle.html, '<div class="test-class">Digital Binder</div>');
  });

  it('should mount bundle styles, HTML markup, and scripts into app-root', () => {
    const rootEl = {
      id: 'app-root',
      innerHTML: ''
    };
    let appendedStyle = null;
    let appendedScript = null;

    global.document.getElementById = (id) => {
      if (id === 'app-root') return rootEl;
      return null;
    };
    global.document.head.appendChild = (el) => { appendedStyle = el; };
    global.document.body.appendChild = (el) => { appendedScript = el; };

    const mockBundle = {
      version: '1.2.0',
      hash: 'hash-abc',
      bundle: {
        styles: 'body { background: #1c2d27; }',
        html: '<main class="binder">Binder UI</main>',
        script: '<script>var x = 10;</script>'
      }
    };

    mountBundle(mockBundle);

    assert.equal(rootEl.innerHTML, '<main class="binder">Binder UI</main>');
    assert.ok(appendedStyle, 'Style tag should be created and appended');
    assert.equal(appendedStyle.textContent, 'body { background: #1c2d27; }');
    assert.ok(appendedScript, 'Script tag should be created and appended');
    assert.equal(appendedScript.textContent, 'var x = 10;');
  });

  it('should handle remote update network errors gracefully without crashing', async () => {
    // Offline / invalid URL simulation
    const result = await checkRemoteUpdate('http://invalid-gas-domain.fake/exec', 'hash-1');
    assert.equal(result, null, 'Should return null when offline or fetch fails');
  });

  it('should return null immediately for checkRemoteUpdate when no gasUrl is given', async () => {
    const result = await checkRemoteUpdate('', 'hash-1');
    assert.equal(result, null);
  });

  it('should return null from getCachedBundle when nothing has been saved yet', async () => {
    const retrieved = await getCachedBundle();
    assert.equal(retrieved, null);
  });

  it('should no-op mountBundle without throwing when #app-root is missing from the DOM', () => {
    global.document.getElementById = () => null;
    assert.doesNotThrow(() => mountBundle({ bundle: { html: '<div>x</div>' } }));
  });

  it('should reuse an existing bundle-styles tag instead of creating a duplicate on remount', () => {
    const rootEl = { id: 'app-root', innerHTML: '' };
    const existingStyleTag = { id: 'day-planner-bundle-styles', textContent: '' };
    let headAppendCalls = 0;

    global.document.getElementById = (id) => {
      if (id === 'app-root') return rootEl;
      if (id === 'day-planner-bundle-styles') return existingStyleTag;
      return null;
    };
    global.document.head.appendChild = () => { headAppendCalls++; };

    mountBundle({ bundle: { styles: 'body { color: red; }' } });

    assert.equal(headAppendCalls, 0, 'Should not append a new style tag when one already exists');
    assert.equal(existingStyleTag.textContent, 'body { color: red; }');
  });

  it('should log (not silently swallow) a genuine Alpine.start() failure during bundle mount', () => {
    const errorCalls = [];
    const originalError = console.error;
    console.error = (...args) => { errorCalls.push(args); };

    const rootEl = { id: 'app-root', innerHTML: '' };
    global.document.getElementById = (id) => (id === 'app-root' ? rootEl : null);

    const alpineError = new Error('Alpine boom');
    global.window = {
      Alpine: {
        start: () => { throw alpineError; }
      }
    };

    assert.doesNotThrow(() => mountBundle({ bundle: {} }));

    console.error = originalError;
    delete global.window;

    assert.ok(
      errorCalls.some((args) => args.includes(alpineError)),
      'Should log the real Alpine error via console.error instead of swallowing it'
    );
  });

  it('should log the underlying IndexedDB error and resolve false when the write transaction fails', async () => {
    const errorCalls = [];
    const originalError = console.error;
    console.error = (...args) => { errorCalls.push(args); };

    const fakeError = new Error('QuotaExceededError');
    global.indexedDB = {
      open: () => {
        const req = {};
        setTimeout(() => {
          req.result = {
            objectStoreNames: { contains: () => true },
            transaction: () => {
              const tx = {
                objectStore: () => ({ put: () => {} }),
                oncomplete: null,
                onerror: null
              };
              setTimeout(() => tx.onerror && tx.onerror({ target: { error: fakeError } }), 0);
              return tx;
            }
          };
          if (req.onsuccess) req.onsuccess();
        }, 0);
        return req;
      }
    };

    const result = await saveCachedBundle({ version: '1.0', bundle: {} });

    console.error = originalError;
    delete global.indexedDB;

    assert.equal(result, false, 'Should resolve false when the transaction fails');
    assert.ok(
      errorCalls.some((args) => args.includes(fakeError)),
      'Should log the real IDBTransaction error, not swallow it silently'
    );
  });

  it('should log service worker registration failures via console.warn, not console.log', async () => {
    const warnCalls = [];
    const logCalls = [];
    const originalWarn = console.warn;
    const originalLog = console.log;
    console.warn = (...args) => { warnCalls.push(args); };
    console.log = (...args) => { logCalls.push(args); };

    global.window = { location: { search: '' } };
    // Node itself defines a getter-only global `navigator`, so it must be overridden via
    // defineProperty rather than plain assignment.
    const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(global, 'navigator');
    Object.defineProperty(global, 'navigator', {
      value: {
        serviceWorker: { register: () => Promise.reject(new Error('SW registration failed')) },
        onLine: false
      },
      configurable: true
    });
    global.document.getElementById = (id) => (id === 'app-root' ? { id: 'app-root', innerHTML: '' } : null);

    await boot();
    // The SW registration call is fire-and-forget (not awaited by boot()) — flush the microtask
    // queue so its .catch() handler has run before asserting on it.
    await new Promise((resolve) => setTimeout(resolve, 0));

    console.warn = originalWarn;
    console.log = originalLog;
    delete global.window;
    if (originalNavigatorDescriptor) {
      Object.defineProperty(global, 'navigator', originalNavigatorDescriptor);
    } else {
      delete global.navigator;
    }

    assert.ok(
      warnCalls.some((args) => String(args[0]).includes('SW registration note')),
      'Should log SW registration failure via console.warn'
    );
    assert.ok(
      !logCalls.some((args) => String(args[0]).includes('SW registration note')),
      'Should not log SW registration failure via console.log'
    );
  });
});
