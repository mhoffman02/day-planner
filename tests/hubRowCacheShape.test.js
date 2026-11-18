/**
 * @file hubRowCacheShape.test.js
 * @description Guard for the Triage row cache (2026-11-18): rows cached under the old shape lacked isInvite and hid the RSVP
 * buttons for up to 6 h. The cached field list and the cache key prefix are pinned together, so adding or removing a
 * cached field without bumping the prefix fails here instead of in production.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../gas-app/HubController.gs', import.meta.url), 'utf8');

// Update BOTH values together: new field list -> new prefix (v3 -> v4 ...).
const PINNED = {
  prefix: 'triageRow.v3:',
  fields: ['url', 'subject', 'snippet', 'preview', 'fromName', 'date', 'labels', 'score', 'band', 'signals', 'ticketKey', 'isInvite', 'suggestions', 'requireConfirmation', 'humanReviewOnly']
};

test('cached Triage row fields and the cache prefix change together', () => {
  const prefix = (src.match(/const HUB_ROW_CACHE_PREFIX_ = '([^']+)';/) || [])[1];
  const list = (src.match(/const HUB_ROW_CACHE_FIELDS_ = \[([^\]]*)\];/) || [])[1];
  assert.ok(prefix && list, 'HUB_ROW_CACHE_PREFIX_ / HUB_ROW_CACHE_FIELDS_ not found in HubController.gs');
  const fields = list.split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(fields, PINNED.fields, 'HUB_ROW_CACHE_FIELDS_ changed: bump HUB_ROW_CACHE_PREFIX_ (old cached rows lack the new shape) and update PINNED in this test');
  assert.equal(prefix, PINNED.prefix, 'HUB_ROW_CACHE_PREFIX_ changed: update PINNED.prefix here, and only with a field-list change');
});
