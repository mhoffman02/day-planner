/**
 * @file hubUi.test.js
 * @description Unit tests for Gmail/Meeting Hub UI helpers: flag-driven visibility, labels,
 * countdown, mirror parity with gas-app/Script.html, and the no-pills style guard.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  isHubViewVisible, scoreBandLabel, ledgerStatusLabel, canRetryLedger,
  formatCutoffCountdown, countBoardItems, limitDocRows, sortDocRows, docRowsOlderThan, DOC_ROW_LIMIT_DEFAULT, formatLocalDateTime, QUEUE_ORDER, QUEUE_TITLES
} from '../src/hubUi.js';

const ON = { GMAIL_ROUTER: true, TRIAGE_BOARD: true, NCMMS_CORE_PILOT: true };

describe('Hub view visibility (feature flags)', () => {
  it('hides both views when flags are missing or OFF (default hidden)', () => {
    [null, undefined, {}, { GMAIL_ROUTER: false, TRIAGE_BOARD: true, NCMMS_CORE_PILOT: true },
      { GMAIL_ROUTER: true }, { GMAIL_ROUTER: 'true', TRIAGE_BOARD: true }].forEach((flags) => {
      assert.equal(isHubViewVisible('triage', flags), false, JSON.stringify(flags));
      assert.equal(isHubViewVisible('meetingPrep', flags), false, JSON.stringify(flags));
    });
  });

  it('shows each view only when its own flag and GMAIL_ROUTER are ON', () => {
    assert.equal(isHubViewVisible('triage', ON), true);
    assert.equal(isHubViewVisible('meetingPrep', ON), true);
    assert.equal(isHubViewVisible('triage', { ...ON, TRIAGE_BOARD: false }), false);
    assert.equal(isHubViewVisible('meetingPrep', { ...ON, TRIAGE_BOARD: false }), true);
    assert.equal(isHubViewVisible('meetingPrep', { ...ON, NCMMS_CORE_PILOT: false }), false);
  });

  it('never shows an unknown view', () => {
    assert.equal(isHubViewVisible('daily', ON), false);
  });
});

describe('Hub presentation helpers', () => {
  it('maps score bands per spec section 11', () => {
    assert.equal(scoreBandLabel(10), 'High confidence');
    assert.equal(scoreBandLabel(8), 'High confidence');
    assert.equal(scoreBandLabel(7), 'Human review');
    assert.equal(scoreBandLabel(4), 'Human review');
    assert.equal(scoreBandLabel(3), 'Likely FYI');
    assert.equal(scoreBandLabel(0), 'Likely FYI');
    assert.equal(scoreBandLabel(-1), 'Noise');
    assert.equal(scoreBandLabel(undefined), 'Unscored');
  });

  it('labels ledger statuses and only ERROR is retryable', () => {
    assert.equal(ledgerStatusLabel('DRY_RUN'), 'Trial only, nothing created');
    assert.equal(ledgerStatusLabel(null), '');
    ['DONE', 'DEFERRED', 'DRY_RUN', 'PENDING', null].forEach((s) => assert.equal(canRetryLedger(s), false));
    assert.equal(canRetryLedger('ERROR'), true);
  });

  it('ledger labels say what the hub did, from the operation key (user 2026-10-13: Done/Skipped confused)', () => {
    assert.equal(ledgerStatusLabel('DONE', 'GMAIL|t1|TASK_TODAY'), 'Task added for today');
    assert.equal(ledgerStatusLabel('DONE', 'GMAIL|t1~k3|TASK'), 'Added to Master Tasks');
    assert.equal(ledgerStatusLabel('DONE', 'GMAIL|t1|WAITING'), 'Waiting item added');
    assert.equal(ledgerStatusLabel('DONE', 'GMAIL|t1|MEETING|ev9'), 'Added to meeting notes');
    assert.equal(ledgerStatusLabel('DONE', 'GMAIL|t1|DISMISS'), 'Dismissed');
    assert.equal(ledgerStatusLabel('DONE', null), 'Done');
    assert.equal(ledgerStatusLabel('SKIPPED', 'GMAIL|t1|TASK_TODAY'), 'Task already added');
    assert.equal(ledgerStatusLabel('SKIPPED', 'GMAIL|t1|TASK'), 'Task already added');
    assert.equal(ledgerStatusLabel('SKIPPED', 'GMAIL|t1|DISMISS'), 'Already dismissed');
    assert.equal(ledgerStatusLabel('SKIPPED', null), 'Already done');
    assert.equal(ledgerStatusLabel('ERROR', 'GMAIL|t1|TASK'), 'Failed');
    assert.equal(ledgerStatusLabel('PENDING', 'GMAIL|t1|TASK'), 'In progress');
  });

  it('formats cutoff countdown', () => {
    const now = new Date(2026, 9, 9, 12, 0, 0).getTime();
    assert.equal(formatCutoffCountdown('2026-10-09T14:15:00', now), 'in 2 h 15 min');
    assert.equal(formatCutoffCountdown('2026-10-09T11:20:00', now), 'passed 40 min ago');
    assert.equal(formatCutoffCountdown('2026-10-11T14:00:00', now), 'in 2 d 2 h');
    assert.equal(formatCutoffCountdown('2026-10-09T12:00:00', now), 'now');
    assert.equal(formatCutoffCountdown('', now), 'No cutoff');
  });

  it('counts items across the four queues', () => {
    assert.deepEqual(QUEUE_ORDER.map((k) => typeof QUEUE_TITLES[k]), ['string', 'string', 'string', 'string']);
    assert.equal(countBoardItems(null), 0);
    assert.equal(countBoardItems({ queues: { directAction: [1, 2], fyiReading: [3] } }), 3);
  });
});

describe('limitDocRows', () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({ itemId: `r${i}` }));
  it('shows the first N in input order and counts the hidden rest', () => {
    [10, 25, 50].forEach((n) => {
      const r = limitDocRows(rows, n);
      assert.equal(r.rows.length, n);
      assert.equal(r.hidden, 60 - n);
      assert.deepEqual(r.rows.map((x) => x.itemId), rows.slice(0, n).map((x) => x.itemId));
    });
  });
  it('All shows everything, hidden 0', () => {
    assert.deepEqual(limitDocRows(rows, 'all'), { rows, hidden: 0 });
    assert.equal(limitDocRows(rows, 'All').hidden, 0);
  });
  it('fewer rows than the limit hides none', () => {
    assert.deepEqual(limitDocRows(rows.slice(0, 3), 10), { rows: rows.slice(0, 3), hidden: 0 });
  });
  it('an invalid limit falls back to 25', () => {
    assert.equal(DOC_ROW_LIMIT_DEFAULT, 25);
    [0, -1, 7, NaN, null, undefined, 'x', '25', {}].forEach((l) => {
      const r = limitDocRows(rows, l);
      assert.equal(r.rows.length, 25, String(l));
      assert.equal(r.hidden, 35);
    });
  });
  it('a non-array yields no rows', () => {
    assert.deepEqual(limitDocRows(null, 10), { rows: [], hidden: 0 });
  });
});

describe('formatLocalDateTime', () => {
  it('renders a UTC ISO instant in local time as "Nov 6, 2026 4:29 pm"', () => {
    assert.equal(formatLocalDateTime(new Date(2026, 10, 6, 16, 29).toISOString()), 'Nov 6, 2026 4:29 pm');
  });
  it('handles midnight, noon and zero-padded minutes', () => {
    assert.equal(formatLocalDateTime(new Date(2026, 0, 5, 0, 5).toISOString()), 'Jan 5, 2026 12:05 am');
    assert.equal(formatLocalDateTime(new Date(2026, 11, 31, 12, 0).toISOString()), 'Dec 31, 2026 12:00 pm');
    assert.equal(formatLocalDateTime(new Date(2026, 6, 4, 9, 7).toISOString()), 'Jul 4, 2026 9:07 am');
  });
  it('a local-time ISO without offset is read as local', () => {
    assert.equal(formatLocalDateTime('2026-11-06T16:29:00'), 'Nov 6, 2026 4:29 pm');
  });
  it('empty or unparseable input yields an empty string', () => {
    ['', null, undefined, 'garbage'].forEach((v) => assert.equal(formatLocalDateTime(v), ''));
  });
});

describe('gas-app/Script.html mirror parity', () => {
  const html = fs.readFileSync(new URL('../gas-app/Script.html', import.meta.url), 'utf8');
  const m = html.match(/HUB-UI-MIRROR-BEGIN[^\n]*\n([\s\S]*?)\/\/ HUB-UI-MIRROR-END/);

  it('has a mirror block', () => assert.ok(m));

  it('mirror behaves identically to src/hubUi.js', () => {
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(`${m[1]}\nthis.api = { isHubViewVisible, scoreBandLabel, ledgerStatusLabel, canRetryLedger, formatCutoffCountdown, limitDocRows, DOC_ROW_LIMIT_DEFAULT, formatLocalDateTime, QUEUE_ORDER, QUEUE_TITLES };`, ctx);
    const mirror = ctx.api;
    ['2026-11-06T21:29:00.000Z', '2026-01-05T00:05:00', '2026-12-31T12:00:00', '', null, 'garbage'].forEach((iso) => {
      assert.equal(mirror.formatLocalDateTime(iso), formatLocalDateTime(iso));
    });
    const flagSets = [null, {}, ON, { ...ON, TRIAGE_BOARD: false }, { ...ON, NCMMS_CORE_PILOT: false }, { GMAIL_ROUTER: false, TRIAGE_BOARD: true }];
    flagSets.forEach((f) => ['triage', 'meetingPrep', 'daily'].forEach((v) => {
      assert.equal(mirror.isHubViewVisible(v, f), isHubViewVisible(v, f));
    }));
    [12, 8, 7, 4, 3, 0, -1, -4, undefined, NaN].forEach((s) => assert.equal(mirror.scoreBandLabel(s), scoreBandLabel(s)));
    ['DONE', 'ERROR', 'DEFERRED', 'DRY_RUN', 'PENDING', 'SKIPPED', 'WEIRD', null].forEach((s) => {
      [null, 'GMAIL|t1|TASK_TODAY', 'GMAIL|t1|TASK', 'GMAIL|t1|WAITING', 'GMAIL|t1|MEETING|e', 'GMAIL|t1|DISMISS', 'odd'].forEach((k) => {
        assert.equal(mirror.ledgerStatusLabel(s, k), ledgerStatusLabel(s, k));
      });
      assert.equal(mirror.canRetryLedger(s), canRetryLedger(s));
    });
    const now = new Date(2026, 9, 9, 12, 0, 0).getTime();
    ['2026-10-09T14:15:00', '2026-10-09T11:20:00', '2026-10-11T14:00:00', '2026-10-09T12:00:00', '', 'garbage'].forEach((iso) => {
      assert.equal(mirror.formatCutoffCountdown(iso, now), formatCutoffCountdown(iso, now));
    });
    const rows = Array.from({ length: 60 }, (_, i) => ({ itemId: `r${i}` }));
    [10, 25, 50, 'all', 'All', 0, -3, 7, '25', null, undefined, NaN, 'x'].forEach((l) => {
      assert.deepEqual(JSON.parse(JSON.stringify(mirror.limitDocRows(rows, l))), limitDocRows(rows, l), String(l));
    });
    assert.deepEqual(JSON.parse(JSON.stringify(mirror.limitDocRows(null, 10))), limitDocRows(null, 10));
    assert.equal(mirror.DOC_ROW_LIMIT_DEFAULT, DOC_ROW_LIMIT_DEFAULT);
    assert.deepEqual([...mirror.QUEUE_ORDER], QUEUE_ORDER);
    assert.deepEqual({ ...mirror.QUEUE_TITLES }, QUEUE_TITLES);
  });
});

describe('Hub styles: flat UI only', () => {
  const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const stylesHtml = fs.readFileSync(new URL('../gas-app/Styles.html', import.meta.url), 'utf8');
  const hubBlock = (text) => text.slice(text.indexOf('Gmail / Meeting Hub: Triage and Meeting Prep views.'));

  it('hub CSS block contains no pill or circle radii', () => {
    [css, stylesHtml].forEach((text) => {
      const block = hubBlock(text);
      assert.ok(block.includes('.hub-action-btn'));
      assert.doesNotMatch(block, /border-radius:\s*(50%|9{3,4}px|99\d*px)/);
      const radii = [...block.matchAll(/border-radius:\s*([\d.]+)px/g)].map((x) => Number(x[1]));
      radii.forEach((r) => assert.ok(r <= 4, `radius ${r}px too round`));
    });
  });

  it('styles.css and Styles.html carry the same hub block', () => {
    assert.equal(hubBlock(css).replace(/\s+/g, ' ').trim(), hubBlock(stylesHtml).replace(/<\/style>\s*$/, '').replace(/\s+/g, ' ').trim());
  });

  it('hub markup avoids pill classes and external links carry rel attributes', () => {
    ['../index.html', '../gas-app/Index.html'].forEach((rel) => {
      const html = fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
      const start = html.indexOf('<!-- View: Gmail Triage board -->');
      const end = html.indexOf('<!-- View 6: Static About Page -->');
      const view = html.slice(start, end);
      assert.doesNotMatch(view, /pill|chip|capsule/i);
      const anchors = view.match(/<a [^>]*href=[^>]*>/g) || [];
      assert.ok(anchors.length > 0);
      anchors.forEach((a) => {
        assert.match(a, /target="_blank"/);
        assert.match(a, /rel="noopener noreferrer"/);
      });
    });
  });
});

describe('sortDocRows', () => {
  const rows = [
    { itemId: 'a', date: '2026-10-01T10:00:00Z', subject: 'A' },
    { itemId: 'u', date: '', subject: 'U' },
    { itemId: 'c', date: '2026-11-03T10:00:00Z', subject: 'C' },
    { itemId: 'b', date: '2026-10-20T10:00:00Z', subject: 'B' }
  ];
  it('newest first by default, undated last', () => {
    assert.deepEqual(sortDocRows(rows).map((r) => r.itemId), ['c', 'b', 'a', 'u']);
    assert.deepEqual(sortDocRows(rows, 'desc').map((r) => r.itemId), ['c', 'b', 'a', 'u']);
  });
  it('oldest first keeps undated last', () => {
    assert.deepEqual(sortDocRows(rows, 'asc').map((r) => r.itemId), ['a', 'b', 'c', 'u']);
  });
  it('does not mutate its input and tolerates non-arrays', () => {
    sortDocRows(rows, 'asc');
    assert.equal(rows[0].itemId, 'a');
    assert.deepEqual(sortDocRows(null), []);
  });
});

describe('docRowsOlderThan', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  const rows = [
    { itemId: 'new', date: '2026-11-01T00:00:00Z' },
    { itemId: 'mid', date: '2026-08-01T00:00:00Z' },
    { itemId: 'old', date: '2024-02-25T00:00:00Z' },
    { itemId: 'undated', date: '' }
  ];
  it('returns ids of rows older than N days, never undated rows', () => {
    assert.deepEqual(docRowsOlderThan(rows, 30, now), ['mid', 'old']);
    assert.deepEqual(docRowsOlderThan(rows, 90, now), ['mid', 'old']);
    assert.deepEqual(docRowsOlderThan(rows, 365, now), ['old']);
  });
  it('a bad age or non-array dismisses nothing', () => {
    assert.deepEqual(docRowsOlderThan(rows, 0, now), []);
    assert.deepEqual(docRowsOlderThan(rows, NaN, now), []);
    assert.deepEqual(docRowsOlderThan(null, 30, now), []);
  });
});
