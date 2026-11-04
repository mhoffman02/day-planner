#!/usr/bin/env node
/**
 * @file tools/status.js
 * @description Prints current git branch, uncommitted changes, last commit,
 * PLAN.md checklist progress, and test file count.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function sh(...args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (err) {
    console.error(`git ${args.join(' ')} failed, reporting empty: ${err.stack}`);
    return '';
  }
}

const branch = sh('rev-parse', '--abbrev-ref', 'HEAD') || 'unknown';
const lastCommit = sh('log', '-1', '--oneline') || 'no commits';
const dirtyFiles = sh('status', '--porcelain').split('\n').filter(Boolean);

let checked = 0;
let unchecked = 0;
const planPath = path.join(ROOT, 'PLAN.md');
if (fs.existsSync(planPath)) {
  const plan = fs.readFileSync(planPath, 'utf8');
  checked = (plan.match(/^\s*- \[x\]/gim) || []).length;
  unchecked = (plan.match(/^\s*- \[ \]/gim) || []).length;
}

const testDir = path.join(ROOT, 'tests');
const testFiles = fs.existsSync(testDir)
  ? fs.readdirSync(testDir).filter((f) => f.endsWith('.test.js'))
  : [];

console.log(`Branch:            ${branch}`);
console.log(`Last commit:       ${lastCommit}`);
console.log(`Uncommitted files: ${dirtyFiles.length}`);
if (dirtyFiles.length) {
  for (const f of dirtyFiles.slice(0, 20)) console.log(`  ${f}`);
  if (dirtyFiles.length > 20) console.log(`  ...and ${dirtyFiles.length - 20} more`);
}
console.log(`PLAN.md checklist: ${checked} done / ${unchecked} open`);
console.log(`Test files:        ${testFiles.length} (tests/*.test.js)`);
