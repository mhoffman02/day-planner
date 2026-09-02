/**
 * @file sync-shell-repo.js
 * @description Ensures the gh-pwa-shell/ nested checkout exists and is up to date, so
 * tools/build-shell-bundle.js (and the pre-commit gate that calls it with --check) never
 * silently no-ops just because a worktree or fresh clone lacks the sibling repo. Clones from
 * the shell repo's remote if missing, otherwise fast-forward pulls it. Best-effort: network/auth
 * failures are reported but never thrown, so a missing connection degrades to the old no-op
 * behavior instead of blocking a build or commit.
 *
 * Usage:
 *   node tools/sync-shell-repo.js   # ensure + report
 *
 * See .agents/rules/sync-gas-app-and-shell-bundle.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const SHELL_REPO_URL = 'https://github.com/mhoffman02/shell.git';
const SHELL_REPO_BRANCH = 'main';
export const SHELL_DIR = path.join(ROOT_DIR, 'gh-pwa-shell');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

function firstLine(err) {
  return String(err.message || err).split('\n')[0];
}

/**
 * Ensures gh-pwa-shell/ exists (cloning it if missing) and is fast-forwarded to origin's
 * latest, so build-shell-bundle.js always sees a real, current checkout instead of silently
 * no-op'ing. Never throws — any failure is reported to stderr and treated as "leave it as-is".
 * @returns {{present: boolean, cloned: boolean, pulled: boolean}}
 */
export function ensureShellRepo() {
  if (!fs.existsSync(path.join(SHELL_DIR, '.git'))) {
    console.log(`[sync-shell-repo] gh-pwa-shell/ not found — cloning ${SHELL_REPO_URL}...`);
    try {
      git(['clone', SHELL_REPO_URL, SHELL_DIR], ROOT_DIR);
      console.log('[sync-shell-repo] gh-pwa-shell/ cloned.');
      return { present: true, cloned: true, pulled: false };
    } catch (err) {
      console.warn(`[sync-shell-repo] WARNING: could not clone gh-pwa-shell (${firstLine(err)}) — continuing without it.`);
      return { present: false, cloned: false, pulled: false };
    }
  }

  try {
    const status = git(['status', '--porcelain'], SHELL_DIR);
    if (status.trim()) {
      console.warn('[sync-shell-repo] gh-pwa-shell/ has uncommitted changes — skipping pull, using local state as-is.');
      return { present: true, cloned: false, pulled: false };
    }
    git(['pull', '--ff-only', 'origin', SHELL_REPO_BRANCH], SHELL_DIR);
    console.log('[sync-shell-repo] gh-pwa-shell/ up to date.');
    return { present: true, cloned: false, pulled: true };
  } catch (err) {
    console.warn(`[sync-shell-repo] WARNING: could not update gh-pwa-shell (${firstLine(err)}) — using local state as-is.`);
    return { present: true, cloned: false, pulled: false };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ensureShellRepo();
}
