#!/usr/bin/env node
/**
 * @file tools/agent-status.js
 * @description Prints the last status line (and last heartbeat) of every subagent log in
 * $CLAUDE_JOB_DIR/tmp/agents/. Log line: `<YYYY-MM-DD HH:mm:ss> <agent> <phase> <done>/<total> <note>`, local time.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PHASES = ['edit', 'verify', 'commit', 'done', 'BLOCKED'];
const STALE_MS = 10 * 60 * 1000;
const LINE_RE = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d) (\S+) (\S+) (\d+)\/(\d+)(?: (.*))?$/;

function malformed(line, why) {
  return new Error(`malformed status line (${why}): ${JSON.stringify(line)}`);
}

/** Parses a local `YYYY-MM-DD HH:mm:ss` prefix into a local Date, or throws. */
function parseTime(parts, line) {
  const [y, mo, d, h, mi, s] = parts.map(Number);
  const t = new Date(y, mo - 1, d, h, mi, s);
  if (t.getFullYear() !== y || t.getMonth() !== mo - 1 || t.getDate() !== d || t.getHours() !== h
    || t.getMinutes() !== mi || t.getSeconds() !== s) {
    throw malformed(line, 'impossible date or time');
  }
  return t;
}

export function parseLine(line) {
  const m = LINE_RE.exec(line);
  if (!m) throw malformed(line, 'expected "<date> <time> <agent> <phase> <done>/<total> <note>"');
  if (!PHASES.includes(m[8])) throw malformed(line, `phase must be one of ${PHASES.join('|')}`);
  return {
    time: parseTime(m.slice(1, 7), line),
    agent: m[7],
    phase: m[8],
    done: Number(m[9]),
    total: Number(m[10]),
    note: m[11] || '',
  };
}

const pad = (n) => String(n).padStart(2, '0');

export function formatClock(date) {
  const h = date.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${pad(h12)}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${h < 12 ? 'am' : 'pm'}`;
}

export function formatAge(ms) {
  const secs = Math.floor(Math.max(0, ms) / 1000);
  return `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
}

function beatSuffix(beat, now) {
  if (!beat) return '';
  const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d) (.*)$/.exec(beat);
  if (!m) throw malformed(beat, 'bad heartbeat line');
  return ` | beat ${formatAge(now - parseTime(m.slice(1, 7), beat))} ${m[7]}`;
}

/** entries: [{ name, line, beat? }]; returns one display line per entry. */
export function formatStatus(entries, now) {
  return entries.map(({ name, line, beat }) => {
    const e = parseLine(line);
    const age = now - e.time;
    const stale = age > STALE_MS && e.phase !== 'done' ? ' STALE' : '';
    return `${name} ${e.phase} ${e.done}/${e.total} ${formatClock(e.time)} age ${formatAge(age)}${stale} ${e.note}${beatSuffix(beat, now)}`.trimEnd();
  }).join('\n');
}

function lastLine(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
  return lines.length ? lines[lines.length - 1] : '';
}

function collect(dir) {
  const files = fs.readdirSync(dir).sort();
  const entries = [];
  for (const f of files.filter((x) => x.endsWith('.log'))) {
    const name = f.slice(0, -4);
    const line = lastLine(path.join(dir, f));
    if (!line) throw new Error(`empty status log: ${path.join(dir, f)}`);
    const beatFile = path.join(dir, `${name}.beat`);
    entries.push({ name, line, beat: fs.existsSync(beatFile) ? lastLine(beatFile) : '' });
  }
  return entries;
}

function main() {
  const job = process.env.CLAUDE_JOB_DIR;
  if (!job) throw new Error('CLAUDE_JOB_DIR is not set');
  const dir = path.join(job, 'tmp', 'agents');
  if (!fs.existsSync(dir)) throw new Error(`no agents directory: ${dir}`);
  const entries = collect(dir);
  console.log(entries.length ? formatStatus(entries, new Date()) : `no agent logs in ${dir}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`agent-status failed: ${err.stack}`);
    process.exitCode = 1;
  }
}
