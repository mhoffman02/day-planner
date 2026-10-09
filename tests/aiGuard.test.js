/**
 * @file aiGuard.test.js
 * @description Unit tests for the AI exclusion guard and the provider-neutral LanguageAssistant.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAiAllowed, LanguageAssistant } from '../src/integration/aiGuard.js';

const SENSITIVE = [['HR/Grievances'], ['HR/'], ['_NCMMS/OIG Audit'], ['_NCMMS/Acquisition'], ['FOIA'], ['Audit Follow-up'], ['COR Procurement Review']];
const SERIES = [true, false, 'TRUE', 'FALSE', 'Conditional'];
const FLAGS = [true, false];
const SELECTED = [true, false, undefined];

describe('isAiAllowed', () => {
  it('sensitive labels blocked in all flag combinations (spec test 16)', () => {
    for (const labels of SENSITIVE) {
      for (const seriesAiAllowed of SERIES) for (const featureFlag of FLAGS) for (const userSelected of SELECTED) {
        assert.equal(isAiAllowed({ labels: ['VIP', ...labels], seriesAiAllowed, featureFlag, userSelected }), false,
          `${labels} ${seriesAiAllowed} ${featureFlag} ${userSelected}`);
      }
    }
  });
  it('explicit audit signal blocks', () => {
    assert.equal(isAiAllowed({ labels: [], seriesAiAllowed: true, featureFlag: true, signals: ['AUDIT'] }), false);
  });
  it('flag off blocks', () => assert.equal(isAiAllowed({ labels: [], seriesAiAllowed: true, featureFlag: false }), false));
  it('series not allowed blocks', () => assert.equal(isAiAllowed({ labels: [], seriesAiAllowed: false, featureFlag: true }), false));
  it('allowed when clean, flag on, series true', () => assert.equal(isAiAllowed({ labels: ['OFM'], seriesAiAllowed: true, featureFlag: true }), true));
  it('Conditional needs explicit user selection', () => {
    assert.equal(isAiAllowed({ labels: [], seriesAiAllowed: 'Conditional', featureFlag: true }), false);
    assert.equal(isAiAllowed({ labels: [], seriesAiAllowed: 'Conditional', featureFlag: true, userSelected: true }), true);
  });
  it('featureFlag must be strictly true', () => assert.equal(isAiAllowed({ labels: [], seriesAiAllowed: true, featureFlag: 'yes' }), false));
  it('fails loud on bad input', () => {
    assert.throws(() => isAiAllowed({ labels: 'x', seriesAiAllowed: true, featureFlag: true }), /labels/);
    assert.throws(() => isAiAllowed(null), /options/);
  });
});

describe('LanguageAssistant', () => {
  it('throws Not configured', () => {
    const a = new LanguageAssistant();
    assert.throws(() => a.draftMeetingFramingLine({}), /Not configured/);
    assert.throws(() => a.extractCandidateActions({}), /Not configured/);
  });
});
