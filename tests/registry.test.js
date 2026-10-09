/**
 * @file registry.test.js
 * @description Unit tests for the Meeting Registry parser/validator and DEFAULT_SERIES.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { REGISTRY_COLUMNS } from '../src/integration/contracts.js';
import { parseRegistry, validateRegistry, DEFAULT_SERIES } from '../src/integration/registry.js';

const HEADER = [...REGISTRY_COLUMNS];
const coreRow = ['TRUE', 'NCMMS_CORE', 'NCMMS Core Team', 'cal1', 'rec1', 'NCMMS Core Team Meeting', 'MEETING', '30', '45', 'doc1', 'TRUE', 'Conditional', '_NCMMS, VIP'];

describe('registry', () => {
  it('(j) parses a valid sheet', () => {
    const [r] = parseRegistry([HEADER, coreRow]);
    assert.equal(r.Enabled, true);
    assert.equal(r.SeriesKey, 'NCMMS_CORE');
    assert.equal(r.PrepMinutes, 30);
    assert.equal(r.PostReviewMinutes, 45);
    assert.deepEqual(r.LabelHints, ['_NCMMS', 'VIP']);
    assert.equal(r.GeminiExpected, 'TRUE');
  });

  it('is header-order insensitive and tolerant of Enabled variants and typed cells', () => {
    const rev = (row) => row.slice().reverse();
    const off = coreRow.slice();
    off[0] = false;
    const typed = ['true', 'B', 'B', '', '', 'B title', 'MEETING', 10, '', '', 'FALSE', 'false', ''];
    const rows = parseRegistry([rev(HEADER), rev(off), rev(typed)]);
    assert.equal(rows[0].Enabled, false);
    assert.equal(rows[1].Enabled, true);
    assert.equal(rows[1].PrepMinutes, 10);
    assert.equal(rows[1].AIAllowed, 'FALSE');
  });

  it('(j) parses Conditional AIAllowed and rejects unknown values', () => {
    assert.equal(parseRegistry([HEADER, coreRow])[0].AIAllowed, 'CONDITIONAL');
    const bad = coreRow.slice();
    bad[11] = 'maybe';
    assert.throws(() => parseRegistry([HEADER, bad]), /AIAllowed/);
  });

  it('(j) throws naming a missing column', () => {
    const h = HEADER.filter((c) => c !== 'PrepMinutes');
    const r = coreRow.filter((_, i) => HEADER[i] !== 'PrepMinutes');
    assert.throws(() => parseRegistry([h, r]), /missing.*PrepMinutes/i);
  });

  it('(j) throws on a non-numeric or negative minute value and names the row/column', () => {
    const bad = coreRow.slice();
    bad[7] = 'abc';
    assert.throws(() => parseRegistry([HEADER, bad]), /PrepMinutes.*NCMMS_CORE|NCMMS_CORE.*PrepMinutes/);
    const neg = coreRow.slice();
    neg[8] = '-5';
    assert.throws(() => parseRegistry([HEADER, neg]), /PostReviewMinutes/);
  });

  it('applies spec section 5 default PrepMinutes when blank', () => {
    const blank = coreRow.slice();
    blank[1] = 'NCMMS_DAILY';
    blank[7] = '';
    blank[8] = '';
    const [r] = parseRegistry([HEADER, blank]);
    assert.equal(r.PrepMinutes, 10);
    assert.equal(r.PostReviewMinutes, 30);
  });

  it('throws on missing mandatory values and duplicate SeriesKey', () => {
    const noKey = coreRow.slice();
    noKey[1] = '';
    assert.throws(() => parseRegistry([HEADER, noKey]), /SeriesKey/);
    const noMatch = coreRow.slice();
    noMatch[4] = '';
    noMatch[5] = '';
    assert.throws(() => parseRegistry([HEADER, noMatch]), /RecurringEventId|TitleFallback/);
    assert.throws(() => parseRegistry([HEADER, coreRow, coreRow]), /duplicate/i);
  });

  it('rejects empty input and skips blank rows', () => {
    assert.throws(() => parseRegistry([]), /header/i);
    assert.equal(parseRegistry([HEADER, new Array(13).fill(''), coreRow]).length, 1);
  });

  it('validateRegistry accepts DEFAULT_SERIES', () => {
    assert.doesNotThrow(() => validateRegistry(DEFAULT_SERIES));
  });

  it('DEFAULT_SERIES has the 10 known series with spec prep cutoffs', () => {
    assert.equal(DEFAULT_SERIES.length, 10);
    const by = Object.fromEntries(DEFAULT_SERIES.map((s) => [s.SeriesKey, s]));
    assert.equal(by.NCMMS_CORE.PrepMinutes, 30);
    assert.equal(by.NCMMS_DAILY.PrepMinutes, 10);
    assert.equal(by.WEEKLY_STATUS.PrepMinutes, 60);
    assert.equal(by.PRODUCT_OWNER_BOARD.TitleFallback, "PBS IT Product Owner's Board Meeting");
    assert.equal(by.NCMMS_CORE.AIAllowed, 'CONDITIONAL');
    assert.equal(by.NCMMS_ACQ.AIAllowed, 'FALSE');
    assert.ok(Object.isFrozen(DEFAULT_SERIES));
  });
});
