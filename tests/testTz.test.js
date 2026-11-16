// Gate for the time-zone matrix: the unit suite runs once per zone and any zone failing fails the run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZONES, runZones } from '../tools/test-tz.js';

test('ZONES cover a US DST zone, UTC and a far-east zone ahead of UTC', () => {
  assert.deepEqual(ZONES, ['America/Chicago', 'UTC', 'Pacific/Auckland']);
});

test('runZones runs every zone with TZ set and reports each failing zone', () => {
  const seen = [];
  const spawn = (env) => {
    seen.push(env.TZ);
    return { status: env.TZ === 'UTC' ? 1 : 0 };
  };
  assert.deepEqual(runZones(spawn), ['UTC']);
  assert.deepEqual(seen, ZONES);
});
