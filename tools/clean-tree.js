// @file Deploys must ship exactly a commit. clasp pushes the gas-app working tree, so an uncommitted edit
// (another agent rebuilding Engines.gs) goes to production unseen: HOME @342 and a WORK version did, on
// 2026-10-30. deploy-home.js and promote-to-work.js call assertCleanGasApp() before any clasp push.

import { spawnSync } from 'node:child_process';

/** Paths in `git status --porcelain` output: modified, staged or untracked; a rename reports its new path. */
export function dirtyPaths(porcelain) {
  return porcelain.split('\n').filter((line) => line.trim()).map((line) => {
    const entry = line.slice(3);
    return entry.includes(' -> ') ? entry.split(' -> ')[1] : entry;
  });
}

/** Throws unless gas-app/ matches HEAD exactly (no modified, staged or untracked files). */
export function assertCleanGasApp(cwd) {
  const res = spawnSync('git', ['status', '--porcelain', '--', 'gas-app'], { cwd, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`git status failed; refusing to deploy: ${res.stderr.trim()}`);
  const dirty = dirtyPaths(res.stdout);
  if (dirty.length) {
    throw new Error(`gas-app has uncommitted changes; commit them first so the deploy is a commit:\n  ${dirty.join('\n  ')}`);
  }
}
