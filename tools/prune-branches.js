#!/usr/bin/env node
/**
 * @file tools/prune-branches.js
 * @description Reports (and, with --apply, cleans up) merged git worktrees and local
 * branches left over from finished background-job sessions. Report-only by default;
 * never touches the current worktree or master/main. All git calls use execFileSync with
 * argv arrays (no shell), so a branch/path containing shell metacharacters — which git ref
 * names do permit — can't be interpreted as a command. Deletion still only ever uses
 * `git worktree remove` (no --force) and `git branch -d` (no -D), which additionally
 * refuse anything dirty or not merged into their own merge target (that target is the
 * branch's upstream if one is set, else the invoking worktree's HEAD — not necessarily
 * origin/master — so treat it as a second-opinion safety net on top of, not a replacement
 * for, this script's own merge-base check against origin/master).
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APPLY = process.argv.includes('--apply');
const PROTECTED_BRANCHES = new Set(['master', 'main']);

/**
 * Runs `git <args>` in the repo root and returns trimmed stdout, or '' on failure.
 * Uses execFileSync (no shell), so args never need shell-quoting.
 * @param {string[]} args Argv to pass to git.
 * @returns {string} Trimmed stdout, or '' on error.
 */
function gitOut(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

/**
 * Runs `git <args>` for its exit code / side effect (e.g. a mutation), capturing a
 * short failure reason instead of throwing.
 * @param {string[]} args Argv to pass to git.
 * @returns {{ok: boolean, message?: string}} Result; `message` is set only when !ok.
 */
function gitRun(args) {
  try {
    execFileSync('git', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true };
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString('utf8') : err.message;
    return { ok: false, message: stderr.trim().split('\n').slice(-2).join(' ') };
  }
}

/**
 * Parses `git worktree list --porcelain` into structured entries.
 * @returns {{path: string, head: string, branch: string|null}[]} One entry per worktree
 * (branch is null for a detached HEAD).
 */
function listWorktrees() {
  const raw = gitOut(['worktree', 'list', '--porcelain']);
  if (!raw) return [];
  const entries = [];
  let current = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) entries.push(current);
      current = { path: line.slice('worktree '.length), head: '', branch: null };
    } else if (line.startsWith('HEAD ')) {
      if (current) current.head = line.slice('HEAD '.length);
    } else if (line.startsWith('branch ')) {
      if (current) current.branch = line.slice('branch refs/heads/'.length);
    }
  }
  if (current) entries.push(current);
  return entries;
}

/**
 * Figures out what to compare branch tips against: `origin/master` if a remote
 * tracking ref exists, else local `master`, else null if neither does (script still
 * runs, just can't classify anything as merged).
 * @returns {string|null} A ref name usable in `git merge-base`, or null.
 */
function resolveBaseRef() {
  if (gitOut(['rev-parse', '--verify', 'origin/master'])) return 'origin/master';
  if (gitOut(['rev-parse', '--verify', 'master'])) return 'master';
  return null;
}

/**
 * @param {string} tip Commit-ish to test (a SHA or branch name).
 * @param {string} baseRef Ref to test ancestry against.
 * @returns {boolean} True if `tip` is `baseRef` or an ancestor of it (i.e. its work is
 * already contained in `baseRef` and it's safe to delete).
 */
function isMergedInto(tip, baseRef) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', tip, baseRef], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

console.log(`Branch hygiene report — ${new Date().toISOString()}`);
console.log('');

// 1. Fetch & prune — report failure explicitly rather than silently proceeding on
// possibly-stale remote-tracking refs (e.g. offline).
let fetchOk = false;
const fetchResult = gitRun(['fetch', '--prune']);
if (fetchResult.ok) {
  fetchOk = true;
  console.log('✅ git fetch --prune succeeded — remote-tracking refs are current.');
} else {
  console.log(`⚠️  git fetch --prune failed (offline / no remote?) — using cached refs.\n   ${fetchResult.message}`);
}
console.log('');

const baseRef = resolveBaseRef();
if (!baseRef) {
  console.log('⚠️  No origin/master or local master found — cannot classify merged vs. unmerged.');
}

// 2. Local master vs origin/master
if (fetchOk && gitOut(['rev-parse', '--verify', 'origin/master']) && gitOut(['rev-parse', '--verify', 'master'])) {
  const counts = gitOut(['rev-list', '--left-right', '--count', 'master...origin/master']);
  const [ahead, behind] = counts.split(/\s+/).map((n) => parseInt(n, 10) || 0);
  if (behind > 0) {
    console.log(`⚠️  local master is ${behind} commit(s) behind origin/master — run: git pull --ff-only`);
  } else {
    console.log('✅ local master is up to date with origin/master.');
  }
  if (ahead > 0) {
    console.log(`ℹ️  local master is ${ahead} commit(s) ahead of origin/master (unpushed).`);
  }
  console.log('');
}

// 3. Worktrees
const currentWorktree = gitOut(['rev-parse', '--show-toplevel']);
const worktrees = listWorktrees();
const mergedWorktreeCandidates = [];

console.log('Worktrees:');
if (worktrees.length <= 1) {
  console.log('  (none besides the main worktree)');
}
for (const wt of worktrees) {
  if (wt.branch && PROTECTED_BRANCHES.has(wt.branch)) {
    console.log(`  •  ${wt.path} (${wt.branch}) — primary branch, skipped`);
    continue;
  }
  if (!wt.branch) {
    console.log(`  •  ${wt.path} (detached HEAD) — skipped`);
    continue;
  }
  if (path.resolve(wt.path) === path.resolve(currentWorktree)) {
    console.log(`  •  ${wt.path} (${wt.branch}) — current worktree, skipped`);
    continue;
  }
  if (!baseRef) {
    console.log(`  •  ${wt.path} (${wt.branch}) — cannot classify (no base ref)`);
    continue;
  }
  if (isMergedInto(wt.head, baseRef)) {
    console.log(`  ✅ ${wt.path} (${wt.branch}) — MERGED into ${baseRef}, candidate for removal`);
    mergedWorktreeCandidates.push(wt);
  } else {
    const aheadCount = gitOut(['rev-list', '--count', `${baseRef}..${wt.head}`]) || '?';
    console.log(`  •  ${wt.path} (${wt.branch}) — ${aheadCount} commit(s) not in ${baseRef}, left alone`);
  }
}
console.log('');

// 4. Local branches not attached to any worktree
const worktreeBranches = new Set(worktrees.map((w) => w.branch).filter(Boolean));
const allBranches = gitOut(['for-each-ref', 'refs/heads', '--format=%(refname:short)'])
  .split('\n').map((b) => b.trim()).filter(Boolean);
const looseBranches = allBranches.filter((b) => !PROTECTED_BRANCHES.has(b) && !worktreeBranches.has(b));
const mergedLooseBranches = [];

console.log('Local branches (no worktree attached):');
if (looseBranches.length === 0) {
  console.log('  (none)');
}
for (const b of looseBranches) {
  if (!baseRef) {
    console.log(`  •  ${b} — cannot classify (no base ref)`);
    continue;
  }
  if (isMergedInto(b, baseRef)) {
    console.log(`  ✅ ${b} — MERGED into ${baseRef}, candidate for removal`);
    mergedLooseBranches.push(b);
  } else {
    console.log(`  •  ${b} — not merged into ${baseRef}, left alone`);
  }
}
console.log('');

const totalCandidates = mergedWorktreeCandidates.length + mergedLooseBranches.length;
if (totalCandidates === 0) {
  console.log('Nothing to clean up.');
  process.exit(0);
}

console.log(`${totalCandidates} candidate(s) found for removal.`);

if (!APPLY) {
  console.log('Re-run with --apply to remove them (git itself still refuses anything dirty or unmerged relative to its own merge target).');
  process.exit(0);
}

console.log('');
console.log('Applying cleanup...');
for (const wt of mergedWorktreeCandidates) {
  console.log(`  Removing worktree ${wt.path}...`);
  const removeResult = gitRun(['worktree', 'remove', wt.path]);
  if (!removeResult.ok) {
    console.log(`    ⚠️  skipped — ${removeResult.message}`);
    continue;
  }
  console.log('    ✅ worktree removed.');
  const branchResult = gitRun(['branch', '-d', wt.branch]);
  if (branchResult.ok) {
    console.log(`    ✅ branch ${wt.branch} deleted.`);
  } else {
    console.log(`    ⚠️  branch ${wt.branch} not deleted — ${branchResult.message}`);
  }
}
for (const b of mergedLooseBranches) {
  console.log(`  Deleting branch ${b}...`);
  const branchResult = gitRun(['branch', '-d', b]);
  if (branchResult.ok) {
    console.log('    ✅ deleted.');
  } else {
    console.log(`    ⚠️  skipped — ${branchResult.message}`);
  }
}
