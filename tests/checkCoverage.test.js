// Gate for the coverage ratchet: totals may never fall below coverage-baseline.json, and a new src file
// that no test loads fails (node only measures files a test imports, so an untested file is invisible).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseLcov, totals, evaluateCoverage, raiseBaseline, listSrc, ratchet } from '../tools/check-coverage.js';

const ROOT = '/repo';
const LCOV = [
  'SF:/repo/src/a.js', 'FNF:4', 'FNH:3', 'BRF:10', 'BRH:8', 'LF:100', 'LH:90', 'end_of_record',
  'SF:/repo/src/integration/b.js', 'FNF:0', 'FNH:0', 'BRF:0', 'BRH:0', 'LF:100', 'LH:100', 'end_of_record',
].join('\n');

test('parseLcov reads per-file counts with repo-relative paths', () => {
  const files = parseLcov(LCOV, ROOT);
  assert.deepEqual(Object.keys(files), ['src/a.js', 'src/integration/b.js']);
  assert.deepEqual(files['src/a.js'], { lf: 100, lh: 90, brf: 10, brh: 8, fnf: 4, fnh: 3 });
});

test('totals are percentages over all files, and an empty denominator counts as 100', () => {
  assert.deepEqual(totals(parseLcov(LCOV, ROOT)), { lines: 95, branches: 80, functions: 75 });
  assert.deepEqual(totals({}), { lines: 100, branches: 100, functions: 100 });
});

const BASE = { lines: 95, branches: 80, functions: 75, unmeasured: ['src/app.js'] };

test('at or above baseline with only known unmeasured files passes', () => {
  const t = { lines: 95, branches: 80.5, functions: 75 };
  assert.deepEqual(evaluateCoverage(t, ['src/a.js'], ['src/a.js', 'src/app.js'], BASE), []);
});

test('a metric below baseline fails and names it', () => {
  const errs = evaluateCoverage({ lines: 94.9, branches: 80, functions: 75 }, [], [], BASE);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /lines 94\.9% < baseline 95%/);
});

test('a src file no test loads fails unless listed as known unmeasured', () => {
  const errs = evaluateCoverage({ lines: 95, branches: 80, functions: 75 }, ['src/a.js'], ['src/a.js', 'src/new.js', 'src/app.js'], BASE);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /src\/new\.js/);
});

test('listSrc finds .js files recursively, repo-relative', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-src-'));
  fs.mkdirSync(path.join(dir, 'src', 'integration'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'a.js'), '');
  fs.writeFileSync(path.join(dir, 'src', 'styles.css'), '');
  fs.writeFileSync(path.join(dir, 'src', 'integration', 'b.js'), '');
  assert.deepEqual(listSrc(dir, 'src').sort(), ['src/a.js', 'src/integration/b.js']);
});

test('ratchet: check fails below baseline, update raises it and writes the file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-rat-'));
  const baselineFile = path.join(dir, 'base.json');
  const writeBase = (lines) => fs.writeFileSync(baselineFile, JSON.stringify({ lines, branches: 80, functions: 75, unmeasured: [] }));
  const opts = { lcovText: LCOV.replaceAll('/repo', dir), root: dir, baselineFile, srcFiles: ['src/a.js', 'src/integration/b.js'], log: () => {} };

  writeBase(96);
  const failed = ratchet(opts);
  assert.equal(failed.ok, false);
  assert.match(failed.errors[0], /lines 95% < baseline 96%/);

  writeBase(90);
  assert.equal(ratchet(opts).ok, true);
  assert.equal(ratchet({ ...opts, update: true }).ok, true);
  assert.equal(JSON.parse(fs.readFileSync(baselineFile, 'utf8')).lines, 95);
});

test('raiseBaseline only ratchets up, floors to 0.1, and drops unmeasured files that are now measured', () => {
  const next = raiseBaseline({ lines: 96.27, branches: 79, functions: 75 }, ['src/app.js'], BASE);
  assert.deepEqual(next, { lines: 96.2, branches: 80, functions: 75, unmeasured: [] });
});
