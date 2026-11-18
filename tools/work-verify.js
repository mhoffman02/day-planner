/**
 * @file work-verify.js
 * @description Read WORK back after `clasp push` and compare its BUILD_NUMBER_ with the pushed one. clasp can print
 * success while the remote HEAD stays old (2026-11-18: build 827 stayed on WORK while HOME was 841), and the IDE then
 * lacks every new function. Used by promote-to-work.js; the pure parts are unit tested.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BUILD_RE = /const BUILD_NUMBER_ = (\d+);/;

/** @param {string} source Code.gs text. @returns {number} */
export function buildNumberFrom(source) {
  const m = BUILD_RE.exec(source);
  if (!m) throw new Error('No "const BUILD_NUMBER_ = N;" stamp found in Code.gs source');
  return Number(m[1]);
}

/**
 * @param {string} localSource Code.gs as pushed.
 * @param {string} remoteSource Code file pulled back from WORK.
 * @returns {number} the build both hold. Throws when WORK is stale.
 */
export function assertRemoteMatches(localSource, remoteSource) {
  const local = buildNumberFrom(localSource);
  const remote = buildNumberFrom(remoteSource);
  if (remote !== local) {
    throw new Error(`WORK holds build ${remote} but build ${local} was pushed: the push did not take effect. Close any open WORK IDE tab and re-run npm run push:work.`);
  }
  return local;
}

/** clasp pulls Code.js unless scriptExtensions says .gs; accept both. */
export function findPulledCode(dir) {
  for (const name of ['Code.js', 'Code.gs']) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`clasp pull into ${dir} produced no Code.js or Code.gs`);
}

/**
 * Pulls WORK into a scratch directory and asserts it holds the local build.
 * @param {{scriptId: string, authArgs: string[], localCodePath: string}} opts
 * @returns {number} the verified build number.
 */
export function verifyRemote({ scriptId, authArgs, localCodePath }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'work-verify-'));
  try {
    const project = path.join(dir, '.clasp.json');
    fs.writeFileSync(project, JSON.stringify({ scriptId, rootDir: dir }));
    execFileSync('npx', ['clasp', ...authArgs, '--project', project, 'pull'], { cwd: dir, stdio: 'pipe' });
    return assertRemoteMatches(fs.readFileSync(localCodePath, 'utf8'), fs.readFileSync(findPulledCode(dir), 'utf8'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
