'use strict';

// Regression/consistency test for indexedDbStore shape drift between src/indexedDbStore.js and
// gas-app/Script.html's copy. As of the tools/build-gas-engines.js reconciliation, Script.html's
// idb* block is generated (via esbuild) from src/indexedDbStore.js -- see
// .claude/rules/sync-src-and-gas-app.md -- so `npm run build:gas:check` is the primary staleness
// guard. This test stays as a second, independent check of the actual behavior (not just
// byte-parity): it asserts Script.html declares an IDB_STORE_* constant and a matching
// createObjectStore() call for every store key src/indexedDbStore.js's STORES defines, and that
// both files' DB version numbers agree. IndexedDB only re-runs its onupgradeneeded migration when
// the version number increases, so an already-onboarded browser's DB would keep a stale,
// incomplete schema forever unless the version is bumped alongside adding new stores.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDB_VERSION, STORES } from '../src/indexedDbStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptHtml = fs.readFileSync(path.join(__dirname, '../gas-app/Script.html'), 'utf8');
const indexedDbStoreSrc = fs.readFileSync(path.join(__dirname, '../src/indexedDbStore.js'), 'utf8');

test('Script.html creates an object store for every src/indexedDbStore.js STORES entry', () => {
  const constValues = {};
  // Matches both a hand-written `const X = 'value';` and esbuild's generated-bundle output
  // (`var X = "value";` -- esbuild's ESM->top-level splice uses var and double quotes).
  for (const m of scriptHtml.matchAll(/(?:const|var|let)\s+(\w+)\s*=\s*["']([^"']+)["'];/g)) {
    constValues[m[1]] = m[2];
  }

  // Resolve STORES.KEY -> the IDB_STORE_* identifier it aliases -> its literal string value.
  // esbuild's bundled `createObjectStore()` calls reference `STORES.DAILY_DATA` (a member
  // expression), not a bare `IDB_STORE_DAILY` identifier, so createObjectStore() calls below
  // need to resolve through both the STORES object literal and constValues.
  const storesMatch = scriptHtml.match(/STORES\s*=\s*\{([\s\S]*?)\};/);
  assert.ok(storesMatch, 'expected a STORES object literal in Script.html');
  const storesMap = {};
  for (const m of storesMatch[1].matchAll(/(\w+)\s*:\s*(\w+)/g)) {
    storesMap[m[1]] = constValues[m[2]];
  }

  const createdStoreNames = [...scriptHtml.matchAll(/createObjectStore\(\s*(\w+)(?:\.(\w+))?\s*,/g)]
    .map(([, base, prop]) => (prop ? storesMap[prop] : constValues[base]))
    .filter(Boolean);

  for (const storeName of Object.values(STORES)) {
    assert.ok(
      createdStoreNames.includes(storeName),
      `Script.html's onupgradeneeded does not create an object store for "${storeName}"`
    );
  }
});

test('Script.html IDB_VERSION matches src/indexedDbStore.js IDB_VERSION', () => {
  const versionMatch = scriptHtml.match(/IDB_VERSION\s*=\s*(\d+)/);
  assert.ok(versionMatch, 'expected an IDB_VERSION constant in Script.html');
  assert.equal(
    Number(versionMatch[1]),
    IDB_VERSION,
    "Script.html's IDB_VERSION must match src/indexedDbStore.js's IDB_VERSION, or an " +
      "already-onboarded browser's IndexedDB will never run onupgradeneeded to pick up newly " +
      'added object stores'
  );
});

// Regression test for a live-observed v93 hang: bumping IDB_VERSION means the open() request
// can't run its upgrade transaction while another tab/window still holds a connection at the
// old version -- the browser fires `blocked`, not `success`/`error`/`upgradeneeded`, and the
// request just sits pending. Without an onblocked handler, every caller awaiting the open
// promise hangs silently forever (no console output), which surfaced as "today's tasks stick"
// when navigating to a new day, because the day's data never finishes loading.
test('src/indexedDbStore.js idbOpen() handles IDBOpenDBRequest.onblocked', () => {
  assert.ok(
    /request\.onblocked\s*=/.test(indexedDbStoreSrc),
    'idbOpen() must handle request.onblocked (a version bump blocks while another tab holds an ' +
      'older connection) instead of leaving every caller awaiting an unresolved promise forever'
  );
});

test("Script.html's idbOpen() handles IDBOpenDBRequest.onblocked", () => {
  assert.ok(
    /request\.onblocked\s*=/.test(scriptHtml),
    'idbOpen() must handle request.onblocked (a version bump blocks while another tab holds an ' +
      'older connection) instead of leaving every caller awaiting an unresolved promise forever'
  );
});
