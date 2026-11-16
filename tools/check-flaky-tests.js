#!/usr/bin/env node
// @file Zero-tolerance flaky-test gate (.agents/rules/zero-flaky-tests.md).
// A flaky test is fixed or deleted the same day, never retried, rerun or skipped. CI already runs the suite
// four times (coverage + three time zones), so a flake shows up red; this gate stops anyone hiding it:
//   tests/*.test.js            retry/retries counts, .skip/.todo, { skip } / { todo } options
//   package.json, workflows    --test-rerun-failures
//   workflows                  continue-on-error, retry actions
//
// Usage: node tools/check-flaky-tests.js [file ...]   (exit 1 and list file:line for every violation)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TEST_RULES = [
  [/\bretr(?:y|ies)\s*:\s*\d/, 'retry count on a test'],
  [/\b(?:test|it|describe|suite)\.(?:skip|todo)\s*\(/, 'skipped or todo test'],
  [/\{\s*(?:[\w$]+\s*:[^{}]*,\s*)?(?:skip|todo)\s*:/, 'skip/todo test option'],
];
const RERUN_RULE = [/--test-rerun-failures/, 'rerun of failed tests'];
const WORKFLOW_RULES = [
  RERUN_RULE,
  [/^\s*continue-on-error\s*:/, 'continue-on-error hides a red step'],
  [/^\s*-?\s*uses\s*:\s*\S*retry/i, 'retry action'],
];

/**
 * @param {string} file Path to check.
 * @returns {Array<[RegExp, string]>} Rules that apply to it.
 */
function rulesFor(file) {
  const base = path.basename(file);
  if (/\.ya?ml$/.test(base)) return WORKFLOW_RULES;
  if (base === 'package.json') return [RERUN_RULE];
  if (/\.test\.js$/.test(base)) return TEST_RULES;
  return [];
}

/**
 * @param {string} dir Directory relative to the repo root.
 * @param {RegExp} pattern File name filter.
 * @returns {string[]} Matching absolute paths, or none if the directory is missing.
 */
function list(dir, pattern) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter((f) => pattern.test(f)).map((f) => path.join(abs, f));
}

// This gate's own test holds the banned patterns as fixtures.
const SELF_TEST = path.join(root, 'tests', 'checkFlakyTests.test.js');

const files = process.argv.length > 2
  ? process.argv.slice(2)
  : [...list('tests', /\.test\.js$/).filter((f) => f !== SELF_TEST), path.join(root, 'package.json'),
    ...list('.github/workflows', /\.ya?ml$/)];

const violations = [];
for (const file of files) {
  const rules = rulesFor(file);
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    for (const [re, why] of rules) {
      if (re.test(line)) violations.push(`${path.relative(root, file)}:${i + 1}: ${why}: ${line.trim()}`);
    }
  });
}

if (violations.length) {
  console.error('❌ Flaky-test gate: fix or delete the test the same day; never retry, rerun or skip it.');
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log(`✅ Flaky-test gate: no retries, reruns or skips in ${files.length} file(s).`);
