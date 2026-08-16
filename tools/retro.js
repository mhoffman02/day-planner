#!/usr/bin/env node
/**
 * @file tools/retro.js
 * @description Appends a dated retrospective entry to LEARNINGS.md from CLI flags,
 * then commits it (unless --dry-run).
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function flag(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : '';
}

const label = flag('label');
const workedWell = flag('worked-well');
const needsImprovement = flag('needs-improvement');
const dryRun = process.argv.includes('--dry-run');

if (!label) {
  console.error(
    'Usage: node tools/retro.js --label "..." --worked-well "a|b" [--needs-improvement "a|b"] [--dry-run]'
  );
  process.exit(1);
}

function list(items) {
  const rendered = items
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `- ${s}`)
    .join('\n');
  return rendered || '- (none)';
}

const date = new Date().toISOString().slice(0, 10);
const entry = [
  `## ${date} — ${label}`,
  '',
  '**Worked well:**',
  list(workedWell),
  '',
  '**Needs improvement:**',
  list(needsImprovement),
  '',
  '---',
  '',
].join('\n');

console.log(entry);

if (dryRun) {
  console.log('(dry run — not written or committed)');
  process.exit(0);
}

const learningsPath = path.join(ROOT, 'LEARNINGS.md');
const existing = fs.existsSync(learningsPath)
  ? fs.readFileSync(learningsPath, 'utf8')
  : '# Learnings\n\n';
fs.writeFileSync(learningsPath, `${existing.trimEnd()}\n\n${entry}`);

execSync('git add LEARNINGS.md', { cwd: ROOT });
execSync(`git commit -m ${JSON.stringify(`docs(retro): ${label}`)}`, {
  cwd: ROOT,
  stdio: 'inherit',
});
