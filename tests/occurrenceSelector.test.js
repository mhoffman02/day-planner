/**
 * @file occurrenceSelector.test.js
 * @description Unit tests for recurring-meeting occurrence selection (spec section 7) and series resolution.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectOccurrence, resolveSeries } from '../src/integration/occurrenceSelector.js';

const TZ = 'America/Los_Angeles';
const series = { SeriesKey: 'NCMMS_CORE', PrepMinutes: 30 };
const occ = (id, start) => ({ id, start, end: start.replace('T08:00', 'T09:00') });
const occs = [
  occ('core_1027', '2026-10-27T08:00:00-07:00'),
  occ('core_1103', '2026-11-03T08:00:00-08:00'),
  occ('core_1110', '2026-11-10T08:00:00-08:00')
];
const sel = (now, extra = {}) => selectOccurrence({ occurrences: occs, series, now, timeZone: TZ, ...extra });

describe('occurrenceSelector', () => {
  it('(a) Monday afternoon routes to the Tuesday occurrence', () => {
    const r = sel('2026-10-26T15:00:00-07:00');
    assert.equal(r.occurrenceId, 'core_1027');
    assert.equal(r.cutoffISO, '2026-10-27T14:30:00.000Z');
    assert.ok(!r.deferred);
  });

  it('(b) Tuesday 07:20 with prep starting 07:30 stays on the same day', () => {
    const withPrep = occs.map((o, i) => (i === 0 ? { ...o, prepStart: '2026-10-27T07:30:00-07:00' } : o));
    const r = selectOccurrence({ occurrences: withPrep, series, now: '2026-10-27T07:20:00-07:00', timeZone: TZ });
    assert.equal(r.occurrenceId, 'core_1027');
    assert.equal(r.cutoffISO, '2026-10-27T14:30:00.000Z');
  });

  it('(c) Tuesday 07:45 defers to the following occurrence', () => {
    const r = sel('2026-10-27T07:45:00-07:00');
    assert.equal(r.occurrenceId, 'core_1103');
    assert.equal(r.deferred, true);
    assert.match(r.reason, /cutoff/i);
  });

  it('linked PREP start wins over start minus PrepMinutes', () => {
    const withPrep = [{ ...occs[0], prep: { start: '2026-10-27T07:00:00-07:00' } }, occs[1]];
    const r = selectOccurrence({ occurrences: withPrep, series, now: '2026-10-27T07:10:00-07:00', timeZone: TZ });
    assert.equal(r.occurrenceId, 'core_1103');
  });

  it('cutoff instant itself is still eligible; one minute later is not', () => {
    assert.equal(sel('2026-10-27T07:30:00-07:00').occurrenceId, 'core_1027');
    assert.equal(sel('2026-10-27T07:31:00-07:00').occurrenceId, 'core_1103');
  });

  it('(d) override current -> today occurrence even after cutoff', () => {
    const r = sel('2026-10-27T07:45:00-07:00', { override: { mode: 'current' } });
    assert.equal(r.occurrenceId, 'core_1027');
    assert.match(r.reason, /override/i);
  });

  it('(d) override current throws when nothing happens today', () => {
    assert.throws(() => sel('2026-10-28T10:00:00-07:00', { override: { mode: 'current' } }), /current/i);
  });

  it('(d) override recommended equals the default', () => {
    const now = '2026-10-27T07:45:00-07:00';
    assert.equal(sel(now, { override: { mode: 'recommended' } }).occurrenceId, sel(now).occurrenceId);
  });

  it('(d) override specific targets by occurrence event id; unknown id throws', () => {
    const r = sel('2026-10-26T15:00:00-07:00', { override: { mode: 'specific', occurrenceId: 'core_1110' } });
    assert.equal(r.occurrenceId, 'core_1110');
    assert.throws(() => sel('2026-10-26T15:00:00-07:00', { override: { mode: 'specific', occurrenceId: 'nope' } }), /nope/);
    assert.throws(() => sel('2026-10-26T15:00:00-07:00', { override: { mode: 'specific' } }), /occurrenceId/);
  });

  it('(d) override backlog returns a series-level parking target', () => {
    const r = sel('2026-10-26T15:00:00-07:00', { override: { mode: 'backlog' } });
    assert.equal(r.occurrenceId, null);
    assert.equal(r.backlog, true);
    assert.equal(r.seriesKey, 'NCMMS_CORE');
  });

  it('rejects unknown override modes and missing inputs', () => {
    assert.throws(() => sel('2026-10-26T15:00:00-07:00', { override: { mode: 'bogus' } }), /mode/);
    assert.throws(() => sel(undefined), /now/);
    assert.throws(() => selectOccurrence({ occurrences: occs, series, now: '2026-10-26T15:00:00-07:00', timeZone: 'Not/AZone' }), /timeZone/);
    assert.throws(() => selectOccurrence({ occurrences: [], series, now: '2026-10-26T15:00:00-07:00', timeZone: TZ }), /occurrence/i);
  });

  it('(e) rescheduled occurrence recomputes cutoff and keeps its id', () => {
    const moved = occs.map((o, i) => (i === 0 ? { ...o, start: '2026-10-27T10:00:00-07:00', end: '2026-10-27T11:00:00-07:00' } : o));
    const r = selectOccurrence({ occurrences: moved, series, now: '2026-10-27T07:45:00-07:00', timeZone: TZ });
    assert.equal(r.occurrenceId, 'core_1027');
    assert.equal(r.cutoffISO, '2026-10-27T16:30:00.000Z');
  });

  it('occurrences already over and cancelled ones are ignored; input order does not matter', () => {
    const shuffled = [occs[2], { ...occs[0], status: 'cancelled' }, occs[1]];
    const r = selectOccurrence({ occurrences: shuffled, series, now: '2026-10-26T15:00:00-07:00', timeZone: TZ });
    assert.equal(r.occurrenceId, 'core_1103');
    assert.throws(() => sel('2026-12-01T00:00:00-08:00'), /upcoming/i);
  });

  it('(k) DST end week (Nov 2026): offset-less floating start resolves in the zone', () => {
    const o = [{ id: 'sun', start: '2026-11-01T08:00:00', end: '2026-11-01T09:00:00' }, { id: 'nxt', start: '2026-11-08T08:00:00', end: '2026-11-08T09:00:00' }];
    const mk = (now) => selectOccurrence({ occurrences: o, series, now, timeZone: TZ });
    const r = mk('2026-11-01T15:29:00Z');
    assert.equal(r.occurrenceId, 'sun');
    assert.equal(r.cutoffISO, '2026-11-01T15:30:00.000Z'); // 07:30 PST = 15:30Z
    assert.equal(mk('2026-11-01T15:31:00Z').occurrenceId, 'nxt');
  });

  it('(k) DST start week (Mar 2027): cutoff correct across the spring-forward boundary', () => {
    const o = [occ('mar9', '2027-03-09T08:00:00-08:00'), occ('mar16', '2027-03-16T08:00:00-07:00')];
    const r = selectOccurrence({ occurrences: o, series, now: '2027-03-09T07:45:00-08:00', timeZone: TZ });
    assert.equal(r.occurrenceId, 'mar16');
    assert.equal(r.cutoffISO, '2027-03-16T14:30:00.000Z'); // 07:30 PDT
    const floating = [{ id: 'f', start: '2027-03-16T08:00:00', end: '2027-03-16T09:00:00' }];
    assert.equal(selectOccurrence({ occurrences: floating, series, now: '2027-03-15T12:00:00Z', timeZone: TZ }).cutoffISO, '2027-03-16T14:30:00.000Z');
    const sunday = [{ id: 's', start: '2027-03-14T03:30:00', end: '2027-03-14T04:30:00' }];
    assert.equal(selectOccurrence({ occurrences: sunday, series, now: '2027-03-14T00:00:00Z', timeZone: TZ }).cutoffISO, '2027-03-14T10:00:00.000Z');
  });

  it('(k) override current uses the zone-local date, not the UTC date', () => {
    const late = [{ id: 'eve', start: '2026-11-03T18:00:00-08:00', end: '2026-11-03T20:00:00-08:00' }];
    const r = selectOccurrence({ occurrences: late, series, now: '2026-11-04T02:30:00Z', timeZone: TZ, override: { mode: 'current' } });
    assert.equal(r.occurrenceId, 'eve');
  });
});

describe('resolveSeries', () => {
  const rows = [{ Enabled: true, SeriesKey: 'NCMMS_CORE', TitleFallback: 'NCMMS Core Team Meeting', RecurringEventId: 'rec1' }];

  it('resolves by RecurringEventId', () => {
    const [r] = resolveSeries(rows, [{ id: 'a', summary: 'NCMMS Core Team Meeting', recurringEventId: 'rec1' }]);
    assert.equal(r.matchedBy, 'recurringEventId');
    assert.equal(r.renamed, false);
    assert.equal(r.events.length, 1);
  });

  it('(f) renamed title still resolves by id and reports the rename', () => {
    const [r] = resolveSeries(rows, [
      { id: 'a', summary: 'Core Team Weekly (new name)', recurringEventId: 'rec1' },
      { id: 'b', summary: 'NCMMS Core Team Meeting', recurringEventId: 'other' }
    ]);
    assert.equal(r.matchedBy, 'recurringEventId');
    assert.equal(r.renamed, true);
    assert.deepEqual(r.events.map((e) => e.id), ['a']);
  });

  it('falls back to normalized title only for discovery and reports the id to persist', () => {
    const noId = [{ ...rows[0], RecurringEventId: '' }];
    const [r] = resolveSeries(noId, [{ id: 'a', summary: '🛠 NCMMS Core Team Meeting', recurringEventId: 'recNew' }]);
    assert.equal(r.matchedBy, 'titleFallback');
    assert.equal(r.discovery, true);
    assert.equal(r.discoveredRecurringEventId, 'recNew');
  });

  it('reports a stale persisted id when only the title matches', () => {
    const [r] = resolveSeries(rows, [{ id: 'a', summary: 'NCMMS Core Team Meeting', recurringEventId: 'recNew' }]);
    assert.equal(r.matchedBy, 'titleFallback');
    assert.equal(r.staleRecurringEventId, true);
  });

  it('reports unresolved series and skips disabled rows; prep events do not match by title', () => {
    const res = resolveSeries([...rows, { Enabled: false, SeriesKey: 'OFF', TitleFallback: 'Off' }], [{ id: 'p', summary: 'NCMMS: Core Team Meeting prep', recurringEventId: 'p1' }]);
    assert.equal(res.length, 1);
    assert.equal(res[0].matchedBy, null);
    assert.equal(res[0].events.length, 0);
  });
});
