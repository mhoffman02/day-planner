/**
 * @file topicRouting.test.js
 * @description Unit tests for label-to-meeting-series destination suggestions (spec section 12).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { suggestDestinations } from '../src/integration/topicRouting.js';

const keys = (r) => r.suggestions.map((s) => s.seriesKey);

describe('suggestDestinations table rows', () => {
  it('_NCMMS/Acquisition -> NCMMS_ACQ', () => assert.deepEqual(keys(suggestDestinations(['_NCMMS/Acquisition'])), ['NCMMS_ACQ']));
  it('_NCMMS/COR-TRM -> TRM_PM then NCMMS_CORE', () => assert.deepEqual(keys(suggestDestinations(['_NCMMS/COR-TRM'])), ['TRM_PM', 'NCMMS_CORE']));
  it('_NCMMS/Approval-Request -> NCMMS_CORE (or task)', () => {
    const r = suggestDestinations(['_NCMMS/Approval-Request']);
    assert.deepEqual(keys(r), ['NCMMS_CORE']);
    assert.match(r.suggestions[0].reason, /task/i);
  });
  it('_NCMMS/OIG Audit -> human review only', () => {
    const r = suggestDestinations(['_NCMMS/OIG Audit', '_NCMMS']);
    assert.deepEqual(r.suggestions, []);
    assert.equal(r.humanReviewOnly, true);
    assert.equal(r.requireConfirmation, true);
  });
  it('_NCMMS/ncmms-support -> NCMMS_DAILY', () => assert.deepEqual(keys(suggestDestinations(['_NCMMS/ncmms-support'])), ['NCMMS_DAILY']));
  it('P&S Tech & Innovation -> FACILITY_TECH', () => assert.deepEqual(keys(suggestDestinations(['P&S Tech & Innovation'])), ['FACILITY_TECH']));
  it('Elevator -> ELEVATOR_DATA', () => assert.deepEqual(keys(suggestDestinations(['Elevator'])), ['ELEVATOR_DATA']));
  it('Jira plus NCMMS -> NCMMS_DAILY', () => assert.deepEqual(keys(suggestDestinations(['Jira', '_NCMMS'])), ['NCMMS_DAILY']));
  it('Jira without NCMMS context -> nothing', () => assert.deepEqual(keys(suggestDestinations(['Jira'])), []));
  it('_NCMMS + VIP -> NCMMS_CORE', () => assert.deepEqual(keys(suggestDestinations(['_NCMMS', 'VIP'])), ['NCMMS_CORE']));
  it('_NCMMS + 00_AR -> NCMMS_CORE', () => assert.deepEqual(keys(suggestDestinations(['_NCMMS', '00_AR'])), ['NCMMS_CORE']));
  it('bare _NCMMS -> NCMMS_DAILY', () => assert.deepEqual(keys(suggestDestinations(['_NCMMS'])), ['NCMMS_DAILY']));
  it('unknown labels -> nothing', () => assert.deepEqual(keys(suggestDestinations(['Random'])), []));
  it('deduplicates, preserves order, every suggestion has a reason', () => {
    const r = suggestDestinations(['_NCMMS/COR-TRM', '_NCMMS', 'VIP']);
    assert.deepEqual(keys(r), ['TRM_PM', 'NCMMS_CORE']);
    assert.ok(r.suggestions.every((s) => s.reason));
  });
});

describe('confirmation', () => {
  it('topic-only suggestion requires confirmation', () => {
    const r = suggestDestinations(['_NCMMS/Acquisition']);
    assert.equal(r.requireConfirmation, true);
    assert.equal(r.explicit, false);
  });
  it('explicit Meeting/NCMMS-Core label bypasses confirmation', () => {
    const r = suggestDestinations(['🎯/Meeting/NCMMS-Core', '_NCMMS/Acquisition']);
    assert.deepEqual(keys(r), ['NCMMS_CORE']);
    assert.equal(r.requireConfirmation, false);
    assert.equal(r.explicit, true);
  });
  it('explicit Meeting/NCMMS-Daily maps to NCMMS_DAILY', () => {
    assert.deepEqual(keys(suggestDestinations(['🎯/Meeting/NCMMS-Daily'])), ['NCMMS_DAILY']);
  });
  it('unknown explicit Meeting label is inert', () => {
    const r = suggestDestinations(['🎯/Meeting/Bogus']);
    assert.deepEqual(r.suggestions, []);
    assert.equal(r.requireConfirmation, true);
  });
  it('fails loud on non-array', () => assert.throws(() => suggestDestinations('x'), /labels/));
});
