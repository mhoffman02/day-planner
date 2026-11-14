// @file Every session lands on origin/pure-gas-main (.agents/rules/no-pr-theater.md). A branch behind it hands off
// stale trackers (2026-11-14: the 11-13 handoff, pushed to GitHub only, was missed) or deploys HOME without another
// session's commits. check-handoff.js reports it; deploy-home.js refuses to push.

import { execFileSync } from 'node:child_process';

// origin/HEAD resolves to master, which diverged on purpose; never derive this from it.
export const LANDING_BRANCH = 'pure-gas-main';
export const LANDING_REF = `origin/${LANDING_BRANCH}`;

/** Problems when the landing branch on GitHub has commits HEAD lacks (another session landed first). */
export function remoteAheadProblems({ ref, ahead, fetchError }) {
  if (fetchError) return [`could not fetch ${ref}: ${fetchError.message.trim()}; cannot tell whether another session landed first`];
  if (!ahead.length) return [];
  return [`${ref} has ${ahead.length} commit(s) HEAD lacks (another session landed first): ${ahead.join('; ')}. ` +
    `Run \`git rebase ${ref}\`, merge their tracker edits into yours, then re-run this check`];
}

const gitIn = (cwd) => (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** Fetches the landing branch and lists its commits HEAD lacks; a failed fetch is returned, never swallowed. */
export function landingAhead(cwd, git = gitIn(cwd)) {
  try {
    git('fetch', '-q', 'origin', LANDING_BRANCH);
    const log = git('log', '--oneline', `HEAD..${LANDING_REF}`);
    return { ref: LANDING_REF, ahead: log ? log.split('\n') : [] };
  } catch (err) {
    console.error('landing-branch: fetching ' + LANDING_REF + ' failed; failing the check closed:', err.stack);
    return { ref: LANDING_REF, ahead: [], fetchError: err };
  }
}

/** Throws unless HEAD already contains every commit on origin/pure-gas-main (and GitHub was reachable). */
export function assertLandingCurrent(cwd, git = gitIn(cwd)) {
  const problems = remoteAheadProblems(landingAhead(cwd, git));
  if (problems.length) throw new Error(`refusing to deploy a branch that may lack landed work:\n  ${problems.join('\n  ')}`);
}
