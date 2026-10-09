/**
 * @file triageScore.test.js
 * @description Unit tests for deterministic Gmail thread triage scoring and queue assignment.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreThread, queueFor, TRIAGE_BAND, TRIAGE_QUEUE, TRIAGE_DEFAULT_WEIGHTS } from '../src/integration/triageScore.js';

const ME = 'me@agency.gov';
function msg(over = {}) {
  return { from: 'boss@agency.gov', to: ['other@agency.gov'], cc: [], date: '2026-10-01T10:00:00Z', bodyText: 'FYI see attached.', isFromUser: false, ...over };
}
function thread(m = {}, labels = []) {
  return { labels, userEmail: ME, messages: [msg(m)] };
}
function pointsOf(t, id, config) {
  const r = scoreThread(t, config);
  const s = r.signals.find((x) => x.id === id);
  return s ? s.points : 0;
}

describe('scoreThread signals in isolation', () => {
  it('To +3', () => assert.equal(pointsOf(thread({ to: [ME] }), 'DIRECT_TO'), 3));
  it('latest from other +2', () => assert.equal(pointsOf(thread(), 'LATEST_FROM_OTHER'), 2));
  it('explicit request +3', () => assert.equal(pointsOf(thread({ bodyText: 'Please review the draft.' }), 'EXPLICIT_REQUEST'), 3));
  it('deadline near request +2', () => assert.equal(pointsOf(thread({ bodyText: 'Please send the report by Friday.' }), 'DEADLINE_NEAR_REQUEST'), 2));
  it('deadline far from request is not counted', () => {
    const far = 'Please review.' + ' filler'.repeat(60) + ' deadline is Friday.';
    assert.equal(pointsOf(thread({ bodyText: far }), 'DEADLINE_NEAR_REQUEST'), 0);
  });
  it('VIP +2', () => assert.equal(pointsOf(thread({}, ['VIP']), 'VIP'), 2));
  it('no user reply since request +3', () => assert.equal(pointsOf(thread({ bodyText: 'Can you confirm?' }), 'NO_REPLY_SINCE_REQUEST'), 3));
  it('user reply after request clears no-reply', () => {
    const t = thread({ bodyText: 'Can you confirm?' });
    t.messages.push(msg({ from: ME, isFromUser: true, bodyText: 'Done' }));
    assert.equal(pointsOf(t, 'NO_REPLY_SINCE_REQUEST'), 0);
  });
  it('only copied -2', () => assert.equal(pointsOf(thread({ cc: [ME] }), 'ONLY_COPIED'), -2));
  it('known automated sender -4', () => assert.equal(pointsOf(thread({ from: 'noreply@jira.example.com' }), 'AUTOMATED_SENDER'), -4));
  for (const l of ['Auto-file', 'News', 'Elevator']) {
    it(`${l} label -4`, () => assert.equal(pointsOf(thread({}, [l]), 'NOISE_LABEL'), -4));
  }
  it('resolved language -3', () => assert.equal(pointsOf(thread({ bodyText: 'This issue is resolved.' }), 'COMPLETED_LANGUAGE'), -3));
  it('weights overridable via config', () => {
    assert.equal(pointsOf(thread({ to: [ME] }), 'DIRECT_TO', { weights: { DIRECT_TO: 10 } }), 10);
  });
  it('defaults are the spec values', () => {
    assert.deepEqual(TRIAGE_DEFAULT_WEIGHTS, {
      DIRECT_TO: 3, LATEST_FROM_OTHER: 2, EXPLICIT_REQUEST: 3, DEADLINE_NEAR_REQUEST: 2, VIP: 2,
      NO_REPLY_SINCE_REQUEST: 3, ONLY_COPIED: -2, AUTOMATED_SENDER: -4, NOISE_LABEL: -4, COMPLETED_LANGUAGE: -3
    });
  });
});

describe('bands', () => {
  // Exact score n via a single DIRECT_TO signal (all other weights zeroed by neutral input).
  const at = (n) => scoreThread(thread({ to: [ME], from: 'a@x.gov', bodyText: 'ok' }, []), {
    weights: { DIRECT_TO: n, LATEST_FROM_OTHER: 0 }
  });
  const cases = [[-1, 'NOISE'], [0, 'LIKELY_FYI'], [3, 'LIKELY_FYI'], [4, 'HUMAN_REVIEW'], [7, 'HUMAN_REVIEW'], [8, 'HIGH_CONFIDENCE']];
  for (const [n, band] of cases) {
    it(`score ${n} -> ${band}`, () => {
      const r = at(n);
      assert.equal(r.score, n);
      assert.equal(r.band, TRIAGE_BAND[band]);
    });
  }
});

describe('safety and queues', () => {
  it('never returns an auto-create action, even at max score', () => {
    const t = thread({ to: [ME], bodyText: 'Please send the report by Friday.' }, ['VIP', '00_AR']);
    const r = scoreThread(t);
    assert.equal(r.band, TRIAGE_BAND.HIGH_CONFIDENCE);
    assert.equal(r.autoCreate, false);
    assert.equal('action' in r, false);
    assert.ok(Object.isFrozen(r));
  });
  it('user-only-CCd automated sender lands in noise', () => {
    const t = thread({ from: 'no-reply@servicenow.example.com', cc: [ME], to: ['list@agency.gov'] });
    const r = scoreThread(t);
    assert.equal(r.band, TRIAGE_BAND.NOISE);
  });
  it('queueFor maps labels and bands', () => {
    const hi = scoreThread(thread({ to: [ME], bodyText: 'Please send by Friday.' }, ['VIP']));
    assert.equal(queueFor(thread({}, ['VIP']), hi), TRIAGE_QUEUE.DIRECT_ACTION);
    const mid = { band: TRIAGE_BAND.HUMAN_REVIEW, score: 5, signals: [] };
    assert.equal(queueFor(thread({}, ['_NCMMS']), mid), TRIAGE_QUEUE.MEETING_CARRY_INS);
    assert.equal(queueFor(thread({}, ['OFM']), mid), TRIAGE_QUEUE.MEETING_CARRY_INS);
    assert.equal(queueFor(thread({}, ['Jira']), mid), TRIAGE_QUEUE.SYSTEM_EXCEPTIONS);
    assert.equal(queueFor(thread({}, ['Elevator']), { band: TRIAGE_BAND.NOISE, score: -4, signals: [] }), TRIAGE_QUEUE.SYSTEM_EXCEPTIONS);
    assert.equal(queueFor(thread({}, ['FYI_Candidate']), { band: TRIAGE_BAND.LIKELY_FYI, score: 2, signals: [] }), TRIAGE_QUEUE.FYI_READING);
    assert.equal(queueFor(thread({}, ['00_AR']), mid), TRIAGE_QUEUE.DIRECT_ACTION);
  });
  it('00_AR alone does not change score (hint only)', () => {
    assert.equal(scoreThread(thread({}, ['00_AR'])).score, scoreThread(thread({}, [])).score);
  });
  it('fails loud on invalid input', () => {
    assert.throws(() => scoreThread(null), /thread/);
    assert.throws(() => scoreThread({ labels: [], messages: [], userEmail: ME }), /messages/);
    assert.throws(() => scoreThread({ labels: [], messages: [msg()] }), /userEmail/);
  });
  it('does not read Date.now', () => {
    const orig = Date.now;
    Date.now = () => { throw new Error('Date.now called'); };
    try { scoreThread(thread({ to: [ME] })); } finally { Date.now = orig; }
  });
});
