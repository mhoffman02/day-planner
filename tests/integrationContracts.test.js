import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_TYPE, WORKFLOW_LABEL, ACTIVE_LABELS, LEDGER_COLUMNS, REGISTRY_COLUMNS,
  DEFAULT_FEATURES, gmailTaskKey, gmailMeetingKey, makeResult
} from '../src/integration/contracts.js';
import { buildEngines } from '../tools/build-gas-engines.js';
import fs from 'node:fs';

test('labels use the bullseye prefix and active set is the v1 four', () => {
  assert.equal(WORKFLOW_LABEL.TASK, '🎯/Task');
  assert.deepEqual([...ACTIVE_LABELS], ['🎯/Task', '🎯/Task-Today', '🎯/Waiting', '🎯/Meeting/NCMMS-Core']);
});

test('event types, ledger and registry columns match the spec', () => {
  assert.equal(Object.keys(EVENT_TYPE).length, 9);
  assert.equal(LEDGER_COLUMNS.length, 13);
  assert.equal(REGISTRY_COLUMNS.length, 13);
  assert.equal(DEFAULT_FEATURES.DRY_RUN, true);
  assert.equal(DEFAULT_FEATURES.GMAIL_ROUTER, false);
});

test('operation keys encode source+action+target and reject bad parts', () => {
  assert.equal(gmailTaskKey('t1'), 'GMAIL|t1|TASK');
  assert.equal(gmailTaskKey('t1', true), 'GMAIL|t1|TASK_TODAY');
  assert.equal(gmailMeetingKey('t1', 'ev9'), 'GMAIL|t1|MEETING|ev9');
  assert.throws(() => gmailTaskKey('a|b'));
  assert.throws(() => gmailTaskKey(''));
});

test('makeResult validates shape', () => {
  assert.throws(() => makeResult({ ok: 'yes', message: 'x' }));
  assert.equal(makeResult({ ok: true, message: 'm' }).ok, true);
});

test('gas-app/Engines.gs is in sync with src/integration', () => {
  assert.equal(fs.readFileSync(new URL('../gas-app/Engines.gs', import.meta.url), 'utf8'), buildEngines());
});
