/**
 * @file occurrenceSelectorNext.test.js
 * @description The Meeting Prep page shows the first occurrence that has not ended, even after its prep cutoff has
 * passed (mail routing still skips it; see occurrenceSelector.test.js).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectOccurrence } from '../src/integration/occurrenceSelector.js';

const TZ = 'America/Los_Angeles';
const series = { SeriesKey: 'NCMMS_CORE', PrepMinutes: 30 };
const occ = (id, start) => ({ id, start, end: start.replace('T08:00', 'T09:00') });
const occs = [
  occ('core_1027', '2026-10-27T08:00:00-07:00'),
  occ('core_1103', '2026-11-03T08:00:00-08:00'),
  occ('core_1110', '2026-11-10T08:00:00-08:00')
];
const next = (now) => selectOccurrence({ occurrences: occs, series, now, timeZone: TZ, override: { mode: 'next' } });

describe('occurrenceSelector next mode (Meeting Prep page)', () => {
  it('shows the imminent meeting after its prep cutoff has passed, flagged cutoffPassed', () => {
    const r = next('2026-10-27T07:45:00-07:00');
    assert.equal(r.occurrenceId, 'core_1027');
    assert.equal(r.cutoffPassed, true);
    assert.ok(!r.deferred);
  });

  it('shows the meeting 30 minutes out, exactly at the cutoff', () => {
    assert.equal(next('2026-10-27T07:30:00-07:00').occurrenceId, 'core_1027');
  });

  it('keeps the in-progress meeting until it ends', () => {
    assert.equal(next('2026-10-27T08:30:00-07:00').occurrenceId, 'core_1027');
    assert.equal(next('2026-10-27T09:01:00-07:00').occurrenceId, 'core_1103');
  });

  it('before the cutoff it matches the routing choice and is not flagged', () => {
    const r = next('2026-10-26T15:00:00-07:00');
    assert.equal(r.occurrenceId, 'core_1027');
    assert.ok(!r.cutoffPassed);
  });

  it('throws when nothing is left to show', () => {
    assert.throws(() => next('2026-12-01T00:00:00-08:00'), /no upcoming occurrence/i);
  });
});
