import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickChecks } from '../tools/edit-gate.js';

test('js and gs files get eslint', () => {
  assert.deepEqual(pickChecks('src/taskEngine.js'), [['npx', 'eslint', 'src/taskEngine.js']]);
  assert.equal(pickChecks('gas-app/Code.gs').length, 1);
});
test('css files get the token gate', () => {
  assert.deepEqual(pickChecks('src/styles.css'), [['node', 'tools/check-css.js']]);
});
test('Styles.html gets eslint and the token gate', () => {
  assert.equal(pickChecks('gas-app/Styles.html').length, 2);
});
test('markdown gets nothing', () => {
  assert.deepEqual(pickChecks('PLAN.md'), []);
});
