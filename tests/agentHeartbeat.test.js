import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beatId, beatLine, appendBeat } from '../tools/agent-heartbeat.js';

const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../tools/agent-heartbeat.js');

test('beatId prefers agent_id, then agent_type, then session_id, then session', () => {
  assert.equal(beatId({ agent_id: 'a1', agent_type: 'worker', session_id: 's' }), 'a1');
  assert.equal(beatId({ agent_type: 'worker', session_id: 's' }), 'worker');
  assert.equal(beatId({ session_id: 's' }), 's');
  assert.equal(beatId({}), 'session');
});

test('beatId strips path separators', () => {
  assert.equal(beatId({ agent_id: '../x/y' }), '.._x_y');
});

test('beatLine uses file_path, else first 60 chars of command', () => {
  const now = new Date(2026, 10, 4, 9, 1, 2);
  assert.equal(beatLine({ tool_name: 'Edit', tool_input: { file_path: '/a/b.js' } }, now), '2026-11-04 09:01:02 Edit /a/b.js');
  const long = 'x'.repeat(100);
  assert.equal(beatLine({ tool_name: 'Bash', tool_input: { command: long } }, now), `2026-11-04 09:01:02 Bash ${'x'.repeat(60)}`);
  assert.equal(beatLine({ tool_name: 'Bash', tool_input: { command: 'a\nb' } }, now), '2026-11-04 09:01:02 Bash a b');
});

test('appendBeat trims to the last 200 lines', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'beat-')), 'x.beat');
  for (let i = 0; i < 205; i++) appendBeat(f, `line ${i}`);
  const lines = fs.readFileSync(f, 'utf8').trimEnd().split('\n');
  assert.equal(lines.length, 200);
  assert.equal(lines[0], 'line 5');
  assert.equal(lines[199], 'line 204');
});

test('hook CLI writes a beat file from piped JSON and exits 0', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'job-'));
  const payload = JSON.stringify({ session_id: 'sess1', tool_name: 'Edit', tool_input: { file_path: '/p/q.js' } });
  execFileSync('node', [HOOK], { input: payload, env: { ...process.env, CLAUDE_JOB_DIR: dir } });
  const last = fs.readFileSync(path.join(dir, 'tmp/agents/sess1.beat'), 'utf8').trim();
  assert.match(last, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d Edit \/p\/q\.js$/);
});

test('hook CLI exits 0 and logs the stack on bad JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'job-'));
  const r = spawnSync('node', [HOOK], { input: '{not json', env: { ...process.env, CLAUDE_JOB_DIR: dir }, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /agent-heartbeat/);
  assert.match(r.stderr, /at /);
});

test('hook CLI exits 0 silently-safe when CLAUDE_JOB_DIR is unset', () => {
  const env = { ...process.env };
  delete env.CLAUDE_JOB_DIR;
  const r = spawnSync('node', [HOOK], { input: '{"tool_name":"Edit"}', env, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /CLAUDE_JOB_DIR/);
});
