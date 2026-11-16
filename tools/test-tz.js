#!/usr/bin/env node
// @file Time-zone matrix: runs the unit suite under each of ZONES so a UTC-shift or DST off-by-one date bug
// fails before release. Dates are this app's most frequent bug class; tests/dstClock.test.js pins the clock
// on DST-change days, and this runner makes those pins bite in a zone behind, at and ahead of UTC.
//
// Usage: npm run test:tz   (CI runs it; exit 1 names each failing zone)

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const ZONES = ['America/Chicago', 'UTC', 'Pacific/Auckland'];

/** Runs `spawn(env)` once per zone; returns the zones whose run exited non-zero. */
export function runZones(spawn) {
  return ZONES.filter((tz) => spawn({ ...process.env, TZ: tz }).status !== 0);
}

function main() {
  const tests = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.js')).map((f) => `tests/${f}`);
  const failed = runZones((env) => {
    console.log(`\n=== TZ=${env.TZ}`);
    return spawnSync(process.execPath, ['--test', '--test-reporter=dot', ...tests], { cwd: ROOT, env, stdio: 'inherit' });
  });
  if (failed.length) {
    console.error(`❌ test:tz: suite fails under ${failed.join(', ')}`);
    process.exit(1);
  }
  console.log(`✅ test:tz: suite passes under ${ZONES.join(', ')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
