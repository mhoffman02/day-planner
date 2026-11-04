#!/usr/bin/env node
/**
 * @file tools/agent-heartbeat.js
 * @description PostToolUse hook. Reads the hook JSON on stdin and appends
 * `<local datetime> <tool_name> <file_path|command first 60 chars>` to
 * $CLAUDE_JOB_DIR/tmp/agents/<id>.beat (last 200 lines kept). Never blocks: always exits 0.
 * Payload id fields (probed 2026-11-04): top-level sessions carry session_id; subagent calls add agent_id/agent_type.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_LINES = 200;
const pad = (n) => String(n).padStart(2, '0');

export function beatId(payload) {
  const raw = payload.agent_id || payload.agent_type || payload.session_id || 'session';
  return String(raw).replace(/[^A-Za-z0-9_.-]/g, '_').replace(/^\.+$/, '_');
}

export function beatLine(payload, now) {
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} `
    + `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const input = payload.tool_input || {};
  const target = input.file_path || String(input.command || '').replace(/\s+/g, ' ').slice(0, 60);
  return `${stamp} ${payload.tool_name || 'unknown'} ${target}`.trimEnd();
}

export function appendBeat(file, line) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const prev = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
  const lines = [...prev, line].slice(-MAX_LINES);
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}

function main() {
  const job = process.env.CLAUDE_JOB_DIR;
  if (!job) throw new Error('CLAUDE_JOB_DIR is not set');
  const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
  appendBeat(path.join(job, 'tmp', 'agents', `${beatId(payload)}.beat`), beatLine(payload, new Date()));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`agent-heartbeat failed, beat not written: ${err.stack}`);
  }
  process.exitCode = 0;
}
