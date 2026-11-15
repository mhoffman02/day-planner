/**
 * @file goalsMockParity.test.js
 * @description gas-app/Script.html cannot import ES modules, so its offline mock bridge carries its own
 * copy of the goal horizons and life areas. This guard keeps that copy equal to the single source,
 * src/integration/goalPlanner.js, so the mock never drifts from what the server sends.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { GOAL_HORIZONS, GOAL_AREAS } from '../src/integration/goalPlanner.js';

test('Script.html mock goal horizons and areas equal goalPlanner', () => {
  const src = fs.readFileSync('gas-app/Script.html', 'utf8');
  const start = src.indexOf('const MOCK_GOAL_HORIZONS = [');
  const areasAt = src.indexOf('const MOCK_GOAL_AREAS = [', start);
  const end = src.indexOf(';', areasAt) + 1;
  assert.ok(start > 0 && areasAt > start && end > areasAt, 'mock goal constants not found in Script.html');
  const ctx = vm.createContext({});
  vm.runInContext(src.slice(start, end) + '\nthis.h = MOCK_GOAL_HORIZONS; this.a = MOCK_GOAL_AREAS;', ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.h)), JSON.parse(JSON.stringify(GOAL_HORIZONS)));
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.a)), [...GOAL_AREAS]);
});
