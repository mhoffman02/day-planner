#!/usr/bin/env node
// @file Mutation ratchet. Scores each file Stryker mutates (killed + timed out over every mutant that ran) and
// fails when any file falls below mutation-baseline.json. Per file, not overall, so a strong file cannot hide a
// weak one; a ratchet, not a target, because equivalent mutants make 100% impossible. Mark a proven-equivalent
// mutant with `// Stryker disable next-line <mutator>: equivalent, <why>` so it is Ignored, not survived.
//
// Usage:
//   npm run test:mutation               # stryker --incremental (only changed code re-tested), then the ratchet
//   npm run test:mutation -- --update   # same, then raise the baseline to the new scores (never down)
//   node tools/check-mutation.js        # ratchet the last report only, no run
// check-handoff.js calls mutationProblems() when a mutated file changed since the last handoff.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_FILE = path.join(ROOT, 'mutation-baseline.json');
const DETECTED = ['Killed', 'Timeout'];
const UNDETECTED = ['Survived', 'NoCoverage'];

const floor1 = (n) => Math.floor(n * 10) / 10;

/** Per-file mutation score (0-100, one decimal, floored) from a mutation-testing-report-schema report. */
export function scoreByFile(report) {
  const scores = {};
  for (const [file, { mutants }] of Object.entries(report.files)) {
    const detected = mutants.filter((x) => DETECTED.includes(x.status)).length;
    const valid = detected + mutants.filter((x) => UNDETECTED.includes(x.status)).length;
    scores[file] = valid === 0 ? 100 : floor1((detected / valid) * 100);
  }
  return scores;
}

export function evaluateMutation(scores, baseline) {
  const errors = [];
  for (const [file, score] of Object.entries(scores)) {
    if (!(file in baseline)) errors.push(`${file} is mutated but has no baseline: run npm run test:mutation -- --update`);
    else if (score < baseline[file]) errors.push(`${file} ${score}% < baseline ${baseline[file]}%: a test no longer notices a code change (open reports/mutation/index.html)`);
  }
  for (const file of Object.keys(baseline)) {
    if (!(file in scores)) errors.push(`${file} is in mutation-baseline.json but not in the report: widen stryker mutate or run --update`);
  }
  return errors;
}

export function raiseMutationBaseline(scores, baseline) {
  const next = {};
  for (const [file, score] of Object.entries(scores)) next[file] = Math.max(baseline[file] ?? 0, floor1(score));
  return next;
}

/** Files whose current source is not what the report mutated: the report says nothing about them. */
export function staleFiles(report, files, read) {
  return files.filter((f) => !report.files[f] || report.files[f].source !== read(f));
}

/** Handoff gate: when a mutated file changed, a report of the current source must exist and pass the ratchet. */
export function mutationProblems({ changed, report, baseline, read }) {
  if (changed.length === 0) return [];
  if (!report) return [`${changed.join(', ')} changed since the last handoff and no mutation report exists: run npm run test:mutation`];
  const stale = staleFiles(report, changed, read);
  if (stale.length) return [`mutation report is stale for ${stale.join(', ')}: run npm run test:mutation`];
  return evaluateMutation(scoreByFile(report), baseline);
}

/** Mutated files `diffNames(base, files)` reports changed since `base` (the last handoff commit; '' = none yet). */
export function changedSince(files, base, diffNames) {
  return base ? diffNames(base, files) : [];
}

/** check-handoff entry: problems when a mutated file changed since `base` and no fresh, passing report covers it. */
export function handoffMutationProblems(root, base, git) {
  const diffNames = (rev, files) => git('diff', '--name-only', rev, '--', ...files).split('\n').filter(Boolean);
  const changed = changedSince(mutatedFiles(root), base, diffNames);
  if (changed.length === 0) return [];
  return mutationProblems({ changed, report: readReport(root), baseline: readBaseline(root), read: (f) => fs.readFileSync(path.join(root, f), 'utf8') });
}

export function mutatedFiles(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, 'stryker.config.json'), 'utf8')).mutate;
}

export function reportPath(root = ROOT) {
  return path.join(root, JSON.parse(fs.readFileSync(path.join(root, 'stryker.config.json'), 'utf8')).jsonReporter.fileName);
}

export function readReport(root = ROOT) {
  const file = reportPath(root);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

export function readBaseline(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, 'mutation-baseline.json'), 'utf8'));
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--run')) {
    const bin = path.join(ROOT, 'node_modules', '.bin', 'stryker');
    const run = spawnSync(bin, ['run', '--incremental'], { cwd: ROOT, stdio: 'inherit' });
    if (run.status !== 0) {
      console.error(`❌ stryker run failed (exit ${run.status}); ratchet not evaluated`);
      process.exit(1);
    }
  }
  const report = readReport();
  if (!report) {
    console.error(`❌ no mutation report at ${path.relative(ROOT, reportPath())}: run npm run test:mutation`);
    process.exit(1);
  }
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const stale = staleFiles(report, mutatedFiles(), read);
  if (stale.length) {
    console.error(`❌ mutation report is stale for ${stale.join(', ')}: run npm run test:mutation`);
    process.exit(1);
  }
  const scores = scoreByFile(report);
  const baseline = readBaseline();
  const shown = Object.entries(scores).map(([f, s]) => `${f} ${s}% (baseline ${baseline[f] ?? 'none'})`).join(', ');
  if (args.includes('--update')) {
    const next = raiseMutationBaseline(scores, baseline);
    fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`✅ mutation baseline ratcheted: ${JSON.stringify(next)}`);
    return;
  }
  const errors = evaluateMutation(scores, baseline);
  if (errors.length) {
    console.error(`❌ mutation ratchet: ${shown}\n❌ ${errors.join('\n❌ ')}`);
    process.exit(1);
  }
  console.log(`✅ mutation: ${shown}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
