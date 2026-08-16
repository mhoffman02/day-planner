#!/usr/bin/env node
/**
 * @file tools/handoff.js
 * @description Writes CONTEXT.md summarizing branch, last commit, uncommitted files,
 * and PLAN.md's open checklist items, for fast resume next session. Commits only
 * CONTEXT.md unless --read-only is passed.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const readOnly = process.argv.includes('--read-only');

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

const planPath = path.join(ROOT, 'PLAN.md');
let openItems = [];
if (fs.existsSync(planPath)) {
  const lines = fs.readFileSync(planPath, 'utf8').split('\n');
  openItems = lines.filter((l) => /^\s*-\s\[ \]/.test(l)).map((l) => l.trim());
}

const now = new Date().toISOString();
const content = [
  '# Session Context',
  '',
  `Generated: ${now}`,
  `Branch: ${branch}`,
  `Last commit: ${lastCommit}`,
  `Uncommitted files: ${dirtyFiles.length}`,
  '',
  '## Open PLAN.md items',
  openItems.length ? openItems.join('\n') : '_None — PLAN.md fully checked off._',
  '',
].join('\n');

if (readOnly) {
  console.log(content);
  process.exit(0);
}

fs.writeFileSync(path.join(ROOT, 'CONTEXT.md'), content);
console.log(content);

sh('git add CONTEXT.md');
execSync(`git commit -m ${JSON.stringify(`docs: update session handoff context (${branch})`)}`, {
  cwd: ROOT,
  stdio: 'inherit',
});
