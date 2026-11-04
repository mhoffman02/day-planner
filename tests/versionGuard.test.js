/**
 * @file versionGuard.test.js
 * @description Apps Script caps a project at 200 versions; deploy:home must fail at the cap and
 * warn near it, and must fail loud when `clasp versions` output cannot be parsed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkVersionCount, parseVersionCount } from '../tools/lib/version-guard.js';

describe('checkVersionCount', () => {
  it('is ok below 180', () => {
    assert.deepEqual(checkVersionCount(179), { level: 'ok', count: 179 });
  });
  it('warns from 180 to 199', () => {
    assert.equal(checkVersionCount(180).level, 'warn');
    assert.equal(checkVersionCount(199).level, 'warn');
  });
  it('fails at 200 and above', () => {
    assert.equal(checkVersionCount(200).level, 'fail');
    assert.equal(checkVersionCount(250).level, 'fail');
  });
  it('rejects a non-count', () => {
    assert.throws(() => checkVersionCount(NaN), /version count/);
    assert.throws(() => checkVersionCount(-1), /version count/);
  });
});

describe('parseVersionCount', () => {
  it('reads the clasp header line', () => {
    assert.equal(parseVersionCount('Found 87 versions.\n235 - No description\n'), 87);
    assert.equal(parseVersionCount('Found 1 version.\n'), 1);
  });
  it('throws on unparseable output', () => {
    assert.throws(() => parseVersionCount('boom'), /clasp versions/);
    assert.throws(() => parseVersionCount(''), /clasp versions/);
  });
});
