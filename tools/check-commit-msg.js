#!/usr/bin/env node
// @file commit-msg gate for .agents/rules/test-before-fix.md. A fix/feat/perf commit that touches
// code (src, gas-app, tools) must name its red run; a fix must also record why the bug escaped and
// which guard now catches it (Maguire: never walk away from a bug). On 2026-10-30 @337-@340 passed
// every test yet never loaded; the guard added was a lint rule plus the deploy:home live gate.
//
// Usage (from .githooks/commit-msg): node tools/check-commit-msg.js <commit-msg-file>

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const CODE_RE = /^(src|gas-app|tools)\//;
const EXEMPT_SUBJECT_RE = /^(Merge |Revert |fixup! |squash! |amend! )/;
const REQUIRED = {
  fix: ['Red-run', 'Escaped-because', 'Guard-added'],
  feat: ['Red-run'],
  perf: ['Red-run'],
};

export function checkCommitMessage(message, stagedFiles) {
  const lines = message.split('\n').filter((line) => !line.startsWith('#'));
  const subject = lines[0] || '';
  if (EXEMPT_SUBJECT_RE.test(subject)) return [];
  const type = (subject.match(/^(\w+)(\([^)]*\))?!?:/) || [])[1];
  const required = REQUIRED[type];
  if (!required || !stagedFiles.some((f) => CODE_RE.test(f))) return [];

  return required
    .filter((key) => !lines.some((line) => new RegExp(`^${key}:\\s*\\S`).test(line)))
    .map((key) => `${type} commit touching code needs a "${key}: ..." line in the body`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const message = fs.readFileSync(process.argv[2], 'utf8');
  const res = spawnSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf8' });
  if (res.status !== 0) {
    console.error('check-commit-msg: git diff --cached failed; blocking the commit:', res.stderr);
    process.exit(1);
  }
  const errors = checkCommitMessage(message, res.stdout.split('\n').filter(Boolean));
  if (errors.length) {
    console.error(`❌ ${errors.join('\n❌ ')}`);
    console.error('See .agents/rules/test-before-fix.md. Red-run names the test and its failure line.');
    process.exit(1);
  }
}
