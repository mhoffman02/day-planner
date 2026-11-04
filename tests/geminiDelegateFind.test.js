/**
 * @file geminiDelegateFind.test.js
 * @description findAgyExecutable must resolve candidates without a shell (paths with spaces/metachars).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findAgyExecutable } from '../tools/gemini-delegate.js';

describe('findAgyExecutable', () => {
  it('finds agy under a HOME containing spaces and shell metacharacters', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'home with space $x '));
    const bin = path.join(home, '.local', 'bin');
    fs.mkdirSync(bin, { recursive: true });
    const agy = path.join(bin, 'agy');
    fs.writeFileSync(agy, '#!/bin/sh\n', { mode: 0o755 });
    const saved = { HOME: process.env.HOME, PATH: process.env.PATH };
    try {
      process.env.HOME = home;
      process.env.PATH = '/usr/bin:/bin';
      assert.equal(findAgyExecutable(), agy);
    } finally {
      process.env.HOME = saved.HOME;
      process.env.PATH = saved.PATH;
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
