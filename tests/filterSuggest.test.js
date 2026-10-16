/**
 * @file filterSuggest.test.js
 * @description Pure filter recommender: features, matching, Gmail query text, precision thresholds, greedy
 * cover, excluded labels, and overlap with existing filters.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  threadFeatures, ruleMatches, ruleQuery, suggestFilters, subjectWords,
  FILTER_TARGET_LABELS, workflowLabelNames, filterCriteriaQuery, precisionOf, coveringFilter
} from '../src/integration/filterSuggest.js';

describe('filter tab helpers', () => {
  it('targets the five automatable labels, never Task-Today, Waiting or Meeting', () => {
    assert.deepEqual([...FILTER_TARGET_LABELS], ['🎯/Task', '🎯/Meeting/NCMMS-Core', '🎯/Meeting/NCMMS-Daily', '🎯/Read', '🎯/Review']);
  });
  it('lists all eight workflow labels for setup', () => assert.equal(workflowLabelNames().length, 8));
  it('reads filter criteria as one Gmail query', () => {
    assert.equal(filterCriteriaQuery({ from: 'a@b.gov', subject: 'Notes:', hasAttachment: true }), 'from:(a@b.gov) subject:(Notes:) has:attachment');
    assert.equal(filterCriteriaQuery({ query: 'list:(x)' }), 'list:(x)');
  });
  it('precision and coverage', () => {
    assert.equal(precisionOf(9, 1), 0.9);
    assert.equal(precisionOf(0, 0), 0);
    assert.equal(coveringFilter(['a', 'b'], [{ filterId: 'F', ids: ['a', 'b', 'c'] }]), 'F');
    assert.equal(coveringFilter(['a', 'b'], [{ filterId: 'F', ids: ['a'] }]), '');
  });
});

const TASK = '🎯/Task';
const t = (id, labels, from, subject, listId = '') => ({ id, labels, from, subject, listId });

describe('features and matching', () => {
  it('extracts address, domain, list id and subject words', () => {
    const f = threadFeatures(t('1', [], 'Pat Lee <Pat.Lee@Agency.GOV>', 'RE: Approval needed for TRM', 'Team <team.lists.agency.gov>'));
    assert.deepEqual(f, { from: 'pat.lee@agency.gov', domain: 'agency.gov', listId: 'team.lists.agency.gov', words: ['approval', 'needed', 'trm'] });
  });
  it('subject phrases match whole words in order', () => {
    const f = threadFeatures(t('1', [], 'a@b.gov', 'Approval needed: COR designation'));
    assert.equal(ruleMatches({ kind: 'subject', value: 'approval needed' }, f), true);
    assert.equal(ruleMatches({ kind: 'subject', value: 'needed approval' }, f), false);
  });
  it('writes Gmail search syntax', () => {
    assert.equal(ruleQuery({ kind: 'domain', value: 'agency.gov' }), 'from:(@agency.gov)');
    assert.equal(ruleQuery({ kind: 'domainSubject', value: 'agency.gov', phrase: 'approval needed' }), 'from:(@agency.gov) subject:("approval needed")');
  });
  it('drops reply prefixes and stopwords', () => assert.deepEqual(subjectWords('Fwd: RE: Please review the plan'), ['review', 'plan']));
});

describe('suggestFilters', () => {
  const labelled = [1, 2, 3, 4].map((i) => t('p' + i, [TASK], 'boss@agency.gov', 'Approval needed ' + i));
  const inbox = [1, 2, 3, 4, 5].map((i) => t('n' + i, [], 'news@agency.gov', 'Weekly digest ' + i));

  it('suggests a precise rule and not one that also catches unlabelled mail', () => {
    const r = suggestFilters({ threads: [...labelled, ...inbox], targetLabels: [TASK] });
    assert.equal(r.suggestions[0].query, 'from:(boss@agency.gov)');
    assert.equal(r.suggestions[0].caught, 4);
    assert.equal(r.suggestions[0].wrong, 0);
    assert.ok(!r.suggestions.some((s) => s.query === 'from:(@agency.gov)'), 'domain rule catches 5 wrong ones');
  });

  it('needs at least minCaught labelled threads', () => {
    const r = suggestFilters({ threads: labelled.slice(0, 2), targetLabels: [TASK] });
    assert.deepEqual(r.suggestions, []);
  });

  it('a second rule must catch threads the first one missed', () => {
    const r = suggestFilters({ threads: [...labelled, ...inbox], targetLabels: [TASK] });
    assert.equal(r.suggestions.length, 1, JSON.stringify(r.suggestions));
  });

  it('skips threads with excluded labels entirely', () => {
    const hr = [1, 2, 3].map((i) => t('h' + i, [TASK, 'HR/Benefits'], 'hr@agency.gov', 'Benefits ' + i));
    const r = suggestFilters({ threads: hr, targetLabels: [TASK], excludedLabels: ['HR/'] });
    assert.equal(r.skipped, 3);
    assert.deepEqual(r.suggestions, []);
  });

  it('measures existing filters and marks a suggestion they already cover', () => {
    const r = suggestFilters({
      threads: [...labelled, ...inbox], targetLabels: [TASK],
      existingFilters: [{ id: 'F1', label: TASK, query: 'from:(boss@agency.gov)', rule: { kind: 'from', value: 'boss@agency.gov' } }]
    });
    assert.deepEqual(r.existing, [{ id: 'F1', label: TASK, query: 'from:(boss@agency.gov)', caught: 4, wrong: 0 }]);
    assert.equal(r.suggestions[0].coveredBy, 'F1');
  });
});
