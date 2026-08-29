'use strict';

// Regression/consistency test for indexedDbStore shape drift between src/indexedDbStore.js and
// gas-app/Script.html's hand-duplicated inline copy (HtmlService can't import ES modules -- see
// .claude/rules/sync-src-and-gas-app.md). src/indexedDbStore.js defines 5 object stores
// (dailyData, monthlyNotes, masterTasks, outboxQueue, monthOverview) at a given DB_VERSION, but
// Script.html's inline copy had only ever created 3 of them. IndexedDB only re-runs its
// onupgradeneeded migration when the version number increases, so an already-onboarded browser's
// DB would keep a stale, incomplete schema forever unless the version is bumped alongside adding
// the missing stores. Since HtmlService/GAS templating can't execute outside the Apps Script
// runtime, this is a static contract check: it asserts Script.html declares an IDB_STORE_*
// constant and a matching createObjectStore() call for every store key src/indexedDbStore.js
// defines, and that both files' DB version numbers agree.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB_VERSION, STORES } from '../src/indexedDbStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptHtml = fs.readFileSync(path.join(__dirname, '../gas-app/Script.html'), 'utf8');

test('Script.html creates an object store for every src/indexedDbStore.js STORES entry', () => {
  const constValues = {};
  for (const m of scriptHtml.matchAll(/const\s+(\w+)\s*=\s*'([^']+)';/g)) {
    constValues[m[1]] = m[2];
  }
  const createdStoreNames = [...scriptHtml.matchAll(/createObjectStore\((\w+),/g)]
    .map((m) => constValues[m[1]])
    .filter(Boolean);

  for (const storeName of Object.values(STORES)) {
    assert.ok(
      createdStoreNames.includes(storeName),
      `Script.html's onupgradeneeded does not create an object store for "${storeName}"`
    );
  }
});

test('Script.html IDB_VERSION matches src/indexedDbStore.js DB_VERSION', () => {
  const versionMatch = scriptHtml.match(/IDB_VERSION\s*=\s*(\d+)/);
  assert.ok(versionMatch, 'expected an IDB_VERSION constant in Script.html');
  assert.equal(
    Number(versionMatch[1]),
    DB_VERSION,
    "Script.html's IDB_VERSION must match src/indexedDbStore.js's DB_VERSION, or an " +
      "already-onboarded browser's IndexedDB will never run onupgradeneeded to pick up newly " +
      'added object stores'
  );
});
