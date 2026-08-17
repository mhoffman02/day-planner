/**
 * @file shellLoader.test.js
 * @description Unit tests for PWA Shell Loader, bundle caching, and DOM mounting engine.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getCachedBundle, saveCachedBundle, mountBundle, checkRemoteUpdate } from '../src/shellLoader.js';

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
        html: '<div class="test-class">Franklin Binder</div>',
        script: 'console.log("App mounted");'
      }
    };

    await saveCachedBundle(mockBundle);
    const retrieved = await getCachedBundle();

    assert.ok(retrieved, 'Should retrieve stored bundle');
    assert.equal(retrieved.version, '1.2.0');
    assert.equal(retrieved.hash, 'test-hash-12345');
    assert.equal(retrieved.bundle.html, '<div class="test-class">Franklin Binder</div>');
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
});
