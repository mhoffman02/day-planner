#!/usr/bin/env node
/**
 * @file tools/status.js
 * @description Prints current git branch, uncommitted changes, last commit,
 * PLAN.md checklist progress, and test file count.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const branch = sh('git rev-parse --abbrev-ref HEAD') || 'unknown';
const lastCommit = sh('git log -1 --oneline') || 'no commits';
const dirtyFiles = sh('git status --porcelain').split('\n').filter(Boolean);

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
