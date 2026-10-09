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
  formatCutoffCountdown, countBoardItems, QUEUE_ORDER, QUEUE_TITLES
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
    assert.equal(ledgerStatusLabel('DRY_RUN'), 'Dry run');
    assert.equal(ledgerStatusLabel(null), '');
    ['DONE', 'DEFERRED', 'DRY_RUN', 'PENDING', null].forEach((s) => assert.equal(canRetryLedger(s), false));
    assert.equal(canRetryLedger('ERROR'), true);
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

describe('gas-app/Script.html mirror parity', () => {
  const html = fs.readFileSync(new URL('../gas-app/Script.html', import.meta.url), 'utf8');
  const m = html.match(/HUB-UI-MIRROR-BEGIN[^\n]*\n([\s\S]*?)\/\/ HUB-UI-MIRROR-END/);

  it('has a mirror block', () => assert.ok(m));

  it('mirror behaves identically to src/hubUi.js', () => {
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(`${m[1]}\nthis.api = { isHubViewVisible, scoreBandLabel, ledgerStatusLabel, canRetryLedger, formatCutoffCountdown, QUEUE_ORDER, QUEUE_TITLES };`, ctx);
    const mirror = ctx.api;
    const flagSets = [null, {}, ON, { ...ON, TRIAGE_BOARD: false }, { ...ON, NCMMS_CORE_PILOT: false }, { GMAIL_ROUTER: false, TRIAGE_BOARD: true }];
    flagSets.forEach((f) => ['triage', 'meetingPrep', 'daily'].forEach((v) => {
      assert.equal(mirror.isHubViewVisible(v, f), isHubViewVisible(v, f));
    }));
    [12, 8, 7, 4, 3, 0, -1, -4, undefined, NaN].forEach((s) => assert.equal(mirror.scoreBandLabel(s), scoreBandLabel(s)));
    ['DONE', 'ERROR', 'DEFERRED', 'DRY_RUN', 'PENDING', 'SKIPPED', 'WEIRD', null].forEach((s) => {
      assert.equal(mirror.ledgerStatusLabel(s), ledgerStatusLabel(s));
      assert.equal(mirror.canRetryLedger(s), canRetryLedger(s));
    });
    const now = new Date(2026, 9, 9, 12, 0, 0).getTime();
    ['2026-10-09T14:15:00', '2026-10-09T11:20:00', '2026-10-11T14:00:00', '2026-10-09T12:00:00', '', 'garbage'].forEach((iso) => {
      assert.equal(mirror.formatCutoffCountdown(iso, now), formatCutoffCountdown(iso, now));
    });
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
