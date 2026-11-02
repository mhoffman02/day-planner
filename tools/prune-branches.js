#!/usr/bin/env node
/**
 * @file tools/prune-branches.js
 * @description Reports (and, with --apply, cleans up) git worktrees and local branches
 * already merged into pure-gas-main, left over from finished background-job sessions.
 * Report-only by default. `master` is a diverged branch here (CLAUDE.md rule 5), so it is
 * never the comparison base and never touched. Every git call is an argv array through
 * spawnSync (no shell). Deletion only uses `git worktree remove` (no --force) and
 * `git branch -d` (no -D); git refuses anything dirty or unmerged as a second opinion on
 * this script's own `merge-base --is-ancestor` gate.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_CANDIDATES = ['origin/pure-gas-main', 'pure-gas-main'];
const PROTECTED_BRANCHES = new Set(['pure-gas-main', 'master', 'main']);

/**
 * @param {string} raw Output of `git worktree list --porcelain`.
 * @returns {{path: string, head: string, branch: string|null, locked: boolean}[]} One entry
 * per worktree; branch is null for a detached HEAD.
 */
export function parseWorktrees(raw) {
  const entries = [];
  let cur = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (cur) entries.push(cur);
      cur = { path: line.slice('worktree '.length), head: '', branch: null, locked: false };
    } else if (!cur) {
      continue;
    } else if (line.startsWith('HEAD ')) {
      cur.head = line.slice('HEAD '.length);
    } else if (line.startsWith('branch ')) {
      cur.branch = line.slice('branch refs/heads/'.length);
    } else if (line === 'locked' || line.startsWith('locked ')) {
      cur.locked = true;
    }
  }
  if (cur) entries.push(cur);
  return entries;
}

/**
 * @param {(ref: string) => boolean} refExists Whether a ref resolves.
 * @returns {string|null} The first existing base ref, or null if none does.
 */
export function pickBaseRef(refExists) {
  return BASE_CANDIDATES.find(refExists) ?? null;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {string[]} args Argv for git, run in the repo root.
 * @returns {{ok: boolean, out: string, err: string}} Never throws.
 */
function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || r.error?.message || '').trim() };
}

/**
 * Runs git and fails loud: a failure that is not an expected probe is logged, not hidden.
 * @param {string[]} args Argv for git.
 * @returns {string} Trimmed stdout, or '' after logging the failure.
 */
function gitOut(args) {
  const r = git(args);
  if (!r.ok) console.error(`prune-branches: git ${args.join(' ')} failed: ${r.err}`);
  return r.out;
}

const refExists = (ref) => git(['rev-parse', '--verify', '--quiet', ref]).ok;
const isMergedInto = (tip, base) => git(['merge-base', '--is-ancestor', tip, base]).ok;

/** Prints the report and, with --apply, removes merged worktrees and branches. */
function main() {
  const apply = process.argv.includes('--apply');
  console.log(`Branch hygiene report ${new Date().toLocaleString()}`);

  const fetched = git(['fetch', '--prune']);
  console.log(fetched.ok ? 'fetch --prune ok: remote refs are current.' : `fetch --prune FAILED, using cached refs: ${fetched.err}`);

  const baseRef = pickBaseRef(refExists);
  if (!baseRef) {
    console.error('prune-branches: no origin/pure-gas-main or pure-gas-main found; cannot classify anything.');
    process.exitCode = 1;
    return;
  }
  console.log(`Base: ${baseRef}`);

  if (baseRef.startsWith('origin/') && refExists('pure-gas-main')) {
    const [ahead, behind] = gitOut(['rev-list', '--left-right', '--count', `pure-gas-main...${baseRef}`])
      .split(/\s+/).map((n) => Number.parseInt(n, 10) || 0);
    if (behind > 0) console.log(`local pure-gas-main is ${behind} commit(s) behind ${baseRef}: git pull --ff-only (not run for you).`);
    if (ahead > 0) console.log(`local pure-gas-main is ${ahead} commit(s) ahead of ${baseRef} (unpushed).`);
  }

  const here = gitOut(['rev-parse', '--show-toplevel']);
  const worktrees = parseWorktrees(gitOut(['worktree', 'list', '--porcelain']));
  const wtCandidates = [];
  console.log('\nWorktrees:');
  for (const wt of worktrees) {
    const label = `${wt.path} (${wt.branch ?? 'detached'})`;
    if (wt.branch && PROTECTED_BRANCHES.has(wt.branch)) console.log(`  skip   ${label}: protected`);
    else if (!wt.branch) console.log(`  skip   ${label}: detached HEAD`);
    else if (path.resolve(wt.path) === path.resolve(here)) console.log(`  skip   ${label}: current worktree`);
    else if (!isMergedInto(wt.head, baseRef)) {
      const n = gitOut(['rev-list', '--count', `${baseRef}..${wt.head}`]) || '?';
      console.log(`  keep   ${label}: ${n} commit(s) not in ${baseRef}`);
    } else if (wt.locked) console.log(`  LOCKED ${label}: merged, but locked (git worktree unlock first; may be a live session)`);
    else {
      console.log(`  MERGED ${label}`);
      wtCandidates.push(wt);
    }
  }

  const attached = new Set(worktrees.map((w) => w.branch).filter(Boolean));
  const loose = gitOut(['for-each-ref', 'refs/heads', '--format=%(refname:short)'])
    .split('\n').filter((b) => b && !PROTECTED_BRANCHES.has(b) && !attached.has(b));
  const looseCandidates = [];
  console.log('\nBranches with no worktree:');
  if (loose.length === 0) console.log('  (none)');
  for (const b of loose) {
    if (isMergedInto(b, baseRef)) {
      console.log(`  MERGED ${b}`);
      looseCandidates.push(b);
    } else console.log(`  keep   ${b}: not merged into ${baseRef}`);
  }

  const total = wtCandidates.length + looseCandidates.length;
  console.log(`\n${total} candidate(s) for removal.`);
  if (total === 0 || !apply) {
    if (total > 0) console.log('Re-run with --apply to remove them (git still refuses anything dirty).');
    return;
  }

  for (const wt of wtCandidates) {
    const rm = git(['worktree', 'remove', wt.path]);
    console.log(rm.ok ? `  removed worktree ${wt.path}` : `  skipped worktree ${wt.path}: ${rm.err}`);
    if (rm.ok) looseCandidates.push(wt.branch);
  }
  for (const b of looseCandidates) {
    const del = git(['branch', '-d', b]);
    console.log(del.ok ? `  deleted branch ${b}` : `  skipped branch ${b}: ${del.err}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
