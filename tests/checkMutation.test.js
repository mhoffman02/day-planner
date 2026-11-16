// Gate for the mutation ratchet: each mutated file's score may never fall below mutation-baseline.json,
// a report whose source no longer matches the file is stale, and the handoff check only demands a run
// when a mutated file changed since the last handoff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreByFile, evaluateMutation, raiseMutationBaseline, staleFiles, mutationProblems, changedSince } from '../tools/check-mutation.js';

const m = (status) => ({ status });
const REPORT = {
  files: {
    'src/a.js': { source: 'A', mutants: [m('Killed'), m('Killed'), m('Timeout'), m('Survived'), m('Ignored'), m('CompileError')] },
    'src/b.js': { source: 'B', mutants: [m('Killed'), m('NoCoverage')] },
    'src/c.js': { source: 'C', mutants: [m('Ignored')] },
  },
};

test('scoreByFile: killed + timeout over killed + timeout + survived + no coverage; ignored and errors excluded', () => {
  assert.deepEqual(scoreByFile(REPORT), { 'src/a.js': 75, 'src/b.js': 50, 'src/c.js': 100 });
});

test('evaluateMutation: at or above baseline passes', () => {
  assert.deepEqual(evaluateMutation({ 'src/a.js': 75, 'src/b.js': 50.1 }, { 'src/a.js': 75, 'src/b.js': 50 }), []);
});

test('evaluateMutation: a file below baseline fails and names it, so a strong file cannot hide a weak one', () => {
  const errs = evaluateMutation({ 'src/a.js': 99, 'src/b.js': 49.9 }, { 'src/a.js': 75, 'src/b.js': 50 });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /src\/b\.js 49\.9% < baseline 50%/);
});

test('evaluateMutation: a mutated file missing from the baseline, or a baselined file missing from the report, fails', () => {
  const errs = evaluateMutation({ 'src/a.js': 80, 'src/new.js': 10 }, { 'src/a.js': 75, 'src/gone.js': 60 });
  assert.equal(errs.length, 2);
  assert.match(errs.join('\n'), /src\/new\.js.*--update/);
  assert.match(errs.join('\n'), /src\/gone\.js.*not in the report/);
});

test('raiseMutationBaseline: only goes up, floors to one decimal, adds new files, drops files no longer mutated', () => {
  const next = raiseMutationBaseline({ 'src/a.js': 80.06, 'src/b.js': 40, 'src/new.js': 33.38 }, { 'src/a.js': 75, 'src/b.js': 50, 'src/gone.js': 60 });
  assert.deepEqual(next, { 'src/a.js': 80, 'src/b.js': 50, 'src/new.js': 33.3 });
});

test('staleFiles: a file whose current source differs from the report (or is absent from it) is stale', () => {
  const read = (f) => ({ 'src/a.js': 'A', 'src/b.js': 'B changed', 'src/d.js': 'D' })[f];
  assert.deepEqual(staleFiles(REPORT, ['src/a.js', 'src/b.js', 'src/d.js'], read), ['src/b.js', 'src/d.js']);
});

const BASELINE = { 'src/a.js': 75, 'src/b.js': 50, 'src/c.js': 100 };
const fresh = (f) => REPORT.files[f].source;

test('mutationProblems: no mutated file changed since the last handoff needs no report', () => {
  assert.deepEqual(mutationProblems({ changed: [], report: null, baseline: BASELINE, read: fresh }), []);
});

test('mutationProblems: a changed mutated file with no report asks for a run', () => {
  const p = mutationProblems({ changed: ['src/a.js'], report: null, baseline: BASELINE, read: fresh });
  assert.equal(p.length, 1);
  assert.match(p[0], /src\/a\.js changed.*npm run test:mutation/);
});

test('mutationProblems: a stale report asks for a run; a fresh passing one is clean; a fresh failing one reports the drop', () => {
  const stale = mutationProblems({ changed: ['src/b.js'], report: REPORT, baseline: BASELINE, read: (f) => (f === 'src/b.js' ? 'new' : fresh(f)) });
  assert.match(stale.join('\n'), /stale.*src\/b\.js/);
  assert.deepEqual(mutationProblems({ changed: ['src/b.js'], report: REPORT, baseline: BASELINE, read: fresh }), []);
  const drop = mutationProblems({ changed: ['src/b.js'], report: REPORT, baseline: { ...BASELINE, 'src/b.js': 60 }, read: fresh });
  assert.match(drop.join('\n'), /src\/b\.js 50% < baseline 60%/);
});

test('changedSince: mutated files the diff from the last handoff names; no handoff commit yet means none', () => {
  const diff = (base, files) => (base === 'h1' ? files.filter((f) => f !== 'src/a.js') : []);
  assert.deepEqual(changedSince(['src/a.js', 'src/b.js'], 'h1', diff), ['src/b.js']);
  assert.deepEqual(changedSince(['src/a.js', 'src/b.js'], '', diff), []);
});
