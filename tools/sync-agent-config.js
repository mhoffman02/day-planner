#!/usr/bin/env node
/**
 * @file sync-agent-config.js
 * @description Mirrors .agents/{rules,commands,skills} — the single hand-edited source of
 * truth — into the real, tracked directories each CLI tool actually reads (.claude/rules,
 * .claude/commands, .claude/skills, .kilo/skills, .kilo/workflows).
 *
 * Real copies are used instead of symlinks because git symlinks silently degrade to
 * plain-text stub files on Windows checkouts without Developer Mode + a symlink-aware git
 * config, which both breaks the tool on that machine and — worse — corrupts the tracked
 * blob for every other clone the next time that machine commits. Real generated files have
 * no such platform dependency.
 *
 * Usage:
 *   node tools/sync-agent-config.js          # regenerate all mirrors
 *   node tools/sync-agent-config.js --check  # verify mirrors match source; exit 1 if not
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const MIRRORS = [
  { src: '.agents/rules', dest: '.claude/rules' },
  { src: '.agents/commands', dest: '.claude/commands' },
  { src: '.agents/skills', dest: '.claude/skills' },
  { src: '.agents/skills', dest: '.kilo/skills' },
  { src: '.agents/commands', dest: '.kilo/workflows' },
];

/**
 * Recursively lists every file under `dir`, as absolute paths.
 * @param {string} dir Directory to walk.
 * @returns {string[]} Absolute paths of all files found (empty if `dir` doesn't exist).
 */
function listFilesRecursive(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}

/**
 * Lists files under `dir` as paths relative to `dir` itself.
 * @param {string} dir Directory to walk.
 * @returns {string[]} Relative file paths.
 */
function relFiles(dir) {
  return listFilesRecursive(dir).map((f) => f.slice(dir.length + 1));
}

let drift = false;

for (const { src, dest } of MIRRORS) {
  const srcAbs = join(ROOT, src);
  const destAbs = join(ROOT, dest);
  const srcFiles = new Set(relFiles(srcAbs));
  const destFiles = new Set(relFiles(destAbs));

  const stale = [...destFiles].filter((f) => !srcFiles.has(f));
  const missingOrChanged = [...srcFiles].filter((f) => {
    const s = readFileSync(join(srcAbs, f));
    const d = join(destAbs, f);
    return !existsSync(d) || !readFileSync(d).equals(s);
  });

  if (stale.length || missingOrChanged.length) {
    drift = true;
    if (CHECK) {
      console.error(`✗ ${dest} is out of sync with ${src}:`);
      for (const f of missingOrChanged) console.error(`    stale/missing: ${f}`);
      for (const f of stale) console.error(`    orphaned: ${f}`);
      continue;
    }
    for (const f of stale) rmSync(join(destAbs, f));
    for (const f of missingOrChanged) {
      const d = join(destAbs, f);
      mkdirSync(dirname(d), { recursive: true });
      writeFileSync(d, readFileSync(join(srcAbs, f)));
    }
    console.log(`✓ regenerated ${dest} from ${src}`);
  }
}

if (CHECK) {
  if (drift) {
    console.error('\nRun `node tools/sync-agent-config.js` to regenerate, then re-stage.');
    process.exit(1);
  }
  console.log('✓ .claude/ and .kilo/ mirrors match .agents/ source.');
} else if (!drift) {
  console.log('✓ mirrors already up to date.');
}
