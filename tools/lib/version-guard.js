/**
 * @file tools/lib/version-guard.js
 * @description Apps Script allows 200 versions per project; every deploy:home creates one. Fail at the
 * cap and warn near it, so the limit is hit on purpose (prune old versions), not mid-deploy.
 */

export const VERSION_WARN_AT = 180;
export const VERSION_FAIL_AT = 200;

/**
 * @param {number} count Versions the project holds now.
 * @returns {{level: 'ok'|'warn'|'fail', count: number}}
 */
export function checkVersionCount(count) {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`checkVersionCount: invalid version count: ${count}`);
  }
  if (count >= VERSION_FAIL_AT) return { level: 'fail', count };
  if (count >= VERSION_WARN_AT) return { level: 'warn', count };
  return { level: 'ok', count };
}

/**
 * @param {string} output Stdout of `clasp versions` ("Found N versions.").
 * @returns {number} N.
 */
export function parseVersionCount(output) {
  const m = /Found (\d+) versions?\b/.exec(output || '');
  if (!m) {
    throw new Error(`could not parse clasp versions output: ${String(output).trim().slice(0, 200)}`);
  }
  return Number(m[1]);
}
