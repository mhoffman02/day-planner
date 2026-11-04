import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseLine, formatStatus, formatClock, formatAge } from '../tools/agent-status.js';

const LINE = '2026-11-04 14:05:09 status-tool verify 3/6 ran lint';

test('parseLine reads a well-formed line', () => {
  const e = parseLine(LINE);
  assert.equal(e.agent, 'status-tool');
  assert.equal(e.phase, 'verify');
  assert.equal(e.done, 3);
  assert.equal(e.total, 6);
  assert.equal(e.note, 'ran lint');
  assert.deepEqual([e.time.getFullYear(), e.time.getMonth(), e.time.getDate(), e.time.getHours(), e.time.getMinutes(), e.time.getSeconds()], [2026, 10, 4, 14, 5, 9]);
});

test('parseLine accepts BLOCKED and a missing note', () => {
  const e = parseLine('2026-11-04 14:05:09 a BLOCKED 1/2');
  assert.equal(e.phase, 'BLOCKED');
  assert.equal(e.note, '');
});

test('parseLine throws with context on malformed lines', () => {
  assert.throws(() => parseLine('garbage'), /malformed status line.*garbage/);
  assert.throws(() => parseLine('2026-11-04 14:05:09 a flying 1/2 x'), /malformed status line/);
  assert.throws(() => parseLine('2026-13-45 99:05:09 a edit 1/2 x'), /malformed status line/);
});

test('formatClock handles 12 am, 12 pm, am and pm', () => {
  assert.equal(formatClock(new Date(2026, 10, 4, 0, 5, 9)), '12:05:09 am');
  assert.equal(formatClock(new Date(2026, 10, 4, 12, 0, 0)), '12:00:00 pm');
  assert.equal(formatClock(new Date(2026, 10, 4, 9, 1, 2)), '09:01:02 am');
  assert.equal(formatClock(new Date(2026, 10, 4, 23, 59, 59)), '11:59:59 pm');
});

test('formatAge is mm:ss and minutes may exceed 59', () => {
  assert.equal(formatAge(0), '00:00');
  assert.equal(formatAge(65000), '01:05');
  assert.equal(formatAge((75 * 60 + 10) * 1000), '75:10');
});

test('formatAge clamps negative ages to zero', () => {
  assert.equal(formatAge(-5000), '00:00');
});

test('formatStatus shows clock and age across midnight rollover', () => {
  const now = new Date(2026, 10, 5, 0, 2, 0);
  const out = formatStatus([{ name: 'status-tool', line: '2026-11-04 23:58:00 status-tool edit 1/6 x' }], now);
  assert.match(out, /status-tool/);
  assert.match(out, /11:58:00 pm/);
  assert.match(out, /04:00/);
  assert.doesNotMatch(out, /STALE/);
});

test('formatStatus flags STALE over 10:00 unless done', () => {
  const now = new Date(2026, 10, 4, 15, 20, 19);
  const stale = formatStatus([{ name: 'a', line: '2026-11-04 14:05:09 a verify 3/6 x' }], now);
  assert.match(stale, /75:10/);
  assert.match(stale, /STALE/);
  const done = formatStatus([{ name: 'a', line: '2026-11-04 14:05:09 a done 6/6 x' }], now);
  assert.doesNotMatch(done, /STALE/);
});

test('formatStatus exactly 10:00 is not stale', () => {
  const now = new Date(2026, 10, 4, 14, 15, 9);
  assert.doesNotMatch(formatStatus([{ name: 'a', line: '2026-11-04 14:05:09 a edit 1/2 x' }], now), /STALE/);
});

test('formatStatus shows beat age', () => {
  const now = new Date(2026, 10, 4, 14, 6, 9);
  const out = formatStatus([{ name: 'a', line: '2026-11-04 14:05:09 a edit 1/2 x', beat: '2026-11-04 14:06:00 Edit src/a.js' }], now);
  assert.match(out, /beat 00:09 Edit src\/a\.js/);
});

test('formatStatus propagates malformed lines instead of skipping', () => {
  assert.throws(() => formatStatus([{ name: 'a', line: 'nope' }], new Date()), /malformed status line/);
});

test('formatStatus throws on a malformed beat line', () => {
  assert.throws(() => formatStatus([{ name: 'a', line: LINE, beat: 'junk' }], new Date()), /bad heartbeat line/);
});

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../tools/agent-status.js');
const runCli = (job) => {
  const env = { ...process.env };
  if (job) env.CLAUDE_JOB_DIR = job; else delete env.CLAUDE_JOB_DIR;
  return spawnSync('node', [CLI], { env, encoding: 'utf8' });
};
const mkAgents = () => {
  const job = fs.mkdtempSync(path.join(os.tmpdir(), 'st-'));
  const dir = path.join(job, 'tmp', 'agents');
  fs.mkdirSync(dir, { recursive: true });
  return { job, dir };
};

test('CLI prints the last line per log plus beat', () => {
  const { job, dir } = mkAgents();
  fs.writeFileSync(path.join(dir, 'a.log'), '2020-01-01 10:00:00 a edit 1/2 first\n2020-01-01 10:01:00 a done 2/2 last\n');
  fs.writeFileSync(path.join(dir, 'a.beat'), '2020-01-01 10:01:30 Edit x.js\n');
  const r = runCli(job);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^a done 2\/2 10:01:00 am age \d+:\d\d last \| beat \d+:\d\d Edit x\.js/);
  assert.doesNotMatch(r.stdout, /first/);
});

test('CLI reports when there are no logs', () => {
  const { job } = mkAgents();
  assert.match(runCli(job).stdout, /no agent logs/);
});

test('CLI fails loud on malformed log, missing dir, unset env and empty log', () => {
  const { job, dir } = mkAgents();
  fs.writeFileSync(path.join(dir, 'bad.log'), 'garbage\n');
  const bad = runCli(job);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /malformed status line/);
  assert.match(bad.stderr, /at /);
  assert.equal(runCli(path.join(job, 'nope')).status, 1);
  assert.equal(runCli('').status, 1);
  fs.writeFileSync(path.join(dir, 'bad.log'), '\n');
  assert.match(runCli(job).stderr, /empty status log/);
});
