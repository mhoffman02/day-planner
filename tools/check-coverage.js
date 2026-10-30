#!/usr/bin/env node
// @file Coverage ratchet. Runs the unit suite with node coverage (lcov), then fails when line, branch or
// function totals fall below coverage-baseline.json, or when a src/**/*.js file is loaded by no test.
// Node only measures files a test imports, so an untested file would otherwise be invisible; known
// gaps (src/app.js) are listed in the baseline as "unmeasured" and must shrink, never grow.
//
// Usage:
//   npm run test:coverage            # check against the baseline
//   npm run test:coverage -- --update  # ratchet the baseline up to the current totals (never down)

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_FILE = path.join(ROOT, 'coverage-baseline.json');
const METRICS = ['lines', 'branches', 'functions'];

export function parseLcov(text, root) {
  const files = {};
  let current = null;
  for (const line of text.split('\n')) {
    const [key, value] = [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1)];
    if (key === 'SF') {
      current = { lf: 0, lh: 0, brf: 0, brh: 0, fnf: 0, fnh: 0 };
      files[path.relative(root, value).split(path.sep).join('/')] = current;
    } else if (current && ['LF', 'LH', 'BRF', 'BRH', 'FNF', 'FNH'].includes(key)) {
      current[key.toLowerCase()] = Number(value);
    }
  }
  return files;
}

const pct = (hit, found) => (found === 0 ? 100 : (hit / found) * 100);

export function totals(files) {
  const sum = { lf: 0, lh: 0, brf: 0, brh: 0, fnf: 0, fnh: 0 };
  for (const f of Object.values(files)) for (const k of Object.keys(sum)) sum[k] += f[k];
  return { lines: pct(sum.lh, sum.lf), branches: pct(sum.brh, sum.brf), functions: pct(sum.fnh, sum.fnf) };
}

export function evaluateCoverage(current, measured, allSrc, baseline) {
  const errors = METRICS
    .filter((m) => current[m] < baseline[m])
    .map((m) => `${m} ${Number(current[m].toFixed(2))}% < baseline ${baseline[m]}%`);
  for (const file of allSrc) {
    if (!measured.includes(file) && !baseline.unmeasured.includes(file)) {
      errors.push(`${file} is loaded by no test: add tests/<name>.test.js that imports it`);
    }
  }
  return errors;
}

export function raiseBaseline(current, measured, baseline) {
  const next = {};
  for (const m of METRICS) next[m] = Math.max(baseline[m], Math.floor(current[m] * 10) / 10);
  next.unmeasured = baseline.unmeasured.filter((f) => !measured.includes(f));
  return next;
}

export function listSrc(root, dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return listSrc(root, rel);
    return e.name.endsWith('.js') ? [rel] : [];
  });
}

/** Evaluates an lcov report against the baseline file; with `update`, ratchets the file up instead. */
export function ratchet({ lcovText, root, baselineFile, srcFiles, update = false, log = console.log }) {
  const files = parseLcov(lcovText, root);
  const current = totals(files);
  const measured = Object.keys(files);
  const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
  const shown = METRICS.map((m) => `${m} ${current[m].toFixed(2)}% (baseline ${baseline[m]}%)`).join(', ');

  if (update) {
    const next = raiseBaseline(current, measured, baseline);
    fs.writeFileSync(baselineFile, `${JSON.stringify(next, null, 2)}\n`);
    log(`✅ baseline ratcheted: ${JSON.stringify(next)}`);
    return { ok: true, errors: [] };
  }
  const errors = evaluateCoverage(current, measured, srcFiles, baseline);
  if (errors.length) {
    log(`❌ coverage ratchet: ${shown}\n❌ ${errors.join('\n❌ ')}`);
    return { ok: false, errors };
  }
  log(`✅ coverage: ${shown}`);
  return { ok: true, errors };
}

function main() {
  const lcovFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dp-cov-')), 'lcov.info');
  const tests = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.js')).map((f) => `tests/${f}`);
  const run = spawnSync(process.execPath, [
    '--test', '--experimental-test-coverage', '--test-coverage-exclude=tests/**',
    '--test-reporter=dot', '--test-reporter-destination=stdout',
    '--test-reporter=lcov', `--test-reporter-destination=${lcovFile}`,
    ...tests,
  ], { cwd: ROOT, stdio: 'inherit' });
  if (run.status !== 0) {
    console.error(`❌ unit tests failed (exit ${run.status}); coverage not evaluated`);
    process.exit(1);
  }

  const { ok } = ratchet({
    lcovText: fs.readFileSync(lcovFile, 'utf8'), root: ROOT, baselineFile: BASELINE_FILE,
    srcFiles: listSrc(ROOT, 'src'), update: process.argv.includes('--update'),
  });
  if (!ok) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
