/**
 * @file workVerify.test.js
 * @description push:work must read WORK back after pushing and fail loud when the remote build number is not the
 * one just pushed (2026-11-18: two pushes printed success while WORK stayed at build 827).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildNumberFrom, assertRemoteMatches, findPulledCode } from '../tools/work-verify.js';

describe('buildNumberFrom', () => {
  it('reads the stamp from Code.gs source', () => {
    assert.equal(buildNumberFrom('x\nconst BUILD_NUMBER_ = 843;\ny'), 843);
  });
  it('throws when there is no stamp', () => {
    assert.throws(() => buildNumberFrom('const other = 1;'), /BUILD_NUMBER_/);
  });
});

describe('assertRemoteMatches', () => {
  const src = (n) => `const BUILD_NUMBER_ = ${n};`;
  it('passes when WORK holds the pushed build', () => {
    assert.equal(assertRemoteMatches(src(843), src(843)), 843);
  });
  it('throws naming both builds when WORK is stale', () => {
    assert.throws(() => assertRemoteMatches(src(842), src(827)), /827.*842|842.*827/);
  });
});

describe('findPulledCode', () => {
  it('finds Code.js or Code.gs in the pulled directory', () => {
    for (const name of ['Code.js', 'Code.gs']) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'work-verify-'));
      fs.writeFileSync(path.join(dir, name), 'const BUILD_NUMBER_ = 1;');
      assert.equal(findPulledCode(dir), path.join(dir, name));
      fs.rmSync(dir, { recursive: true });
    }
  });
  it('throws when the pull produced no Code file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'work-verify-'));
    assert.throws(() => findPulledCode(dir), /Code/);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('promote-to-work wiring', () => {
  const src = fs.readFileSync(new URL('../tools/promote-to-work.js', import.meta.url), 'utf8');
  it('verifies the remote after the push and before reporting success', () => {
    const verify = src.indexOf('verifyRemote({');
    assert.ok(verify > src.indexOf("'push', '--force'"), 'verify runs after push');
    assert.ok(verify < src.indexOf('Successfully pushed'), 'verify runs before the success banner');
  });
});
