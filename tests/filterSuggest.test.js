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
    assert.deepEqual([f.from, f.domain, f.listId, f.words], ['pat.lee@agency.gov', 'agency.gov', 'team.lists.agency.gov', ['approval', 'needed', 'for', 'trm']]);
    assert.ok(f.subjectPhrases.has('approval needed'));
    assert.ok(!f.subjectPhrases.has('needed for'), 'no phrase with a stopword');
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
  it('drops reply prefixes and keeps word order (phrases must be adjacent words, as Gmail searches them)', () => {
    assert.deepEqual(subjectWords('Fwd: RE: Please review the plan'), ['please', 'review', 'the', 'plan']);
  });
  it('a subject phrase does not match words that are not next to each other', () => {
    const f = threadFeatures(t('1', [], 'a@b.gov', 'Approval is needed'));
    assert.equal(ruleMatches({ kind: 'subject', value: 'approval needed' }, f), false);
  });
});

describe('body phrases (server-side; only the query leaves the server)', () => {
  const body = (i, extra) => `Hello team, the container scan results for build ${i} are attached. ${extra}`;
  const subjects = ['Quick note', 'Status today', 'Attached files', 'Weekly check'];
  const labelled = [1, 2, 3, 4].map((i) => ({ ...t('b' + i, ['🎯/Review'], `p${i}@agency${i}.gov`, subjects[i - 1]), body: body(i, 'Thanks') }));
  const inbox = [1, 2, 3, 4, 5].map((i) => ({ ...t('o' + i, [], `q${i}@agency.gov`, `Lunch ${i}`), body: 'See you at noon for the team lunch.' }));

  it('suggests a quoted body phrase when senders and subjects vary', () => {
    const r = suggestFilters({ threads: [...labelled, ...inbox], targetLabels: ['🎯/Review'] });
    const q = r.suggestions.map((s) => s.query);
    assert.ok(q.includes('"container scan results"') || q.includes('"scan results"') || q.includes('"container scan"'), JSON.stringify(q));
    const s = r.suggestions[0];
    assert.equal(s.caught, 4);
    assert.equal(s.wrong, 0);
  });

  it('never builds phrases from stopwords or bare numbers', () => {
    const r = suggestFilters({ threads: [...labelled, ...inbox], targetLabels: ['🎯/Review'], options: { maxPerLabel: 50, minNew: 0 } });
    for (const s of r.suggestions) {
      const words = (s.query.match(/"([^"]+)"/) || [null, ''])[1].split(' ').filter(Boolean);
      for (const w of words) assert.ok(!['the', 'for', 'are', 'and'].includes(w) && !/^\d+$/.test(w), s.query);
    }
  });

  it('a full sample (260 threads, 300-word bodies) runs in well under the Apps Script limit', () => {
    const words = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda omicron sigma tau upsilon'.split(' ');
    const long = (seed) => Array.from({ length: 300 }, (_, k) => words[(k * 7 + seed) % words.length]).join(' ');
    const threads = Array.from({ length: 260 }, (_, i) => ({ ...t('x' + i, i < 60 ? ['🎯/Task'] : [], `u${i % 40}@d${i % 9}.gov`, `Subject ${i % 13} words here`), body: long(i) }));
    const t0 = Date.now();
    suggestFilters({ threads, targetLabels: ['🎯/Task', '🎯/Read'] });
    assert.ok(Date.now() - t0 < 3000, `took ${Date.now() - t0} ms`);
  });
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
