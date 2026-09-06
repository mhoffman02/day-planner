#!/usr/bin/env node
/**
 * @file tools/agent-bridge.js
 * @description Bi-directional messaging and state synchronization bridge between Claude Code CLI and Antigravity CLI.
 * Allows each harness to send handoff directives, review requests, and status updates to the other.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BRIDGE_FILE = path.join(ROOT, '.agents', 'BRIDGE.md');
const STATE_FILE = path.join(ROOT, '.agents', 'bridge-state.json');

/**
 * Runs a shell command in ROOT and returns trimmed output.
 * @param {string} cmd Shell command.
 * @returns {string} Output string.
 */
function sh(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/**
 * Loads current bridge state.
 * @returns {{ messages: Array<{ id: string, timestamp: string, from: string, to: string, type: string, text: string, status: string }> }}
 */
function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (err) {
      console.error(`⚠️ Warning: Failed to parse ${STATE_FILE}: ${err.message}`);
      const backup = `${STATE_FILE}.corrupt-${Date.now()}`;
      fs.copyFileSync(STATE_FILE, backup);
      console.error(`📦 Corrupted state backed up to ${backup}`);
    }
  }
  return { messages: [] };
}

/**
 * Saves bridge state and regenerates .agents/BRIDGE.md.
 * @param {object} state Bridge state.
 */
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');

  // Regenerate .agents/BRIDGE.md
  const lines = [
    '# Inter-Harness Communication Bridge (Claude Code ↔ Antigravity)',
    '',
    '> This file tracks bi-directional communication, task delegations, and review requests',
    '> between **Claude Code CLI** (Tier 1 Lead Architect / Reviewer) and **Antigravity CLI** (Tier 2 Driver / Tier 3 Worker).',
    '',
    `*Last Updated: ${new Date().toISOString()}*`,
    '',
    '## Pending Messages',
    ''
  ];

  const pending = state.messages.filter((m) => m.status === 'pending');
  if (pending.length === 0) {
    lines.push('_No pending messages. Both harnesses in sync._', '');
  } else {
    for (const msg of pending) {
      lines.push(`### 📬 [${msg.id}] From: \`${msg.from.toUpperCase()}\` ➔ To: \`${msg.to.toUpperCase()}\` (${msg.type})`);
      lines.push(`- **Time**: ${msg.timestamp}`);
      lines.push(`- **Status**: \`${msg.status}\``);
      lines.push(`- **Message**:`);
      lines.push(`> ${msg.text.replace(/\n/g, '\n> ')}`);
      lines.push('');
    }
  }

  lines.push('## Recent Message History (Last 10)', '');
  const history = [...state.messages].reverse().slice(0, 10);
  if (history.length === 0) {
    lines.push('_No message history yet._', '');
  } else {
    lines.push('| ID | From | To | Type | Status | Time | Summary |');
    lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
    for (const m of history) {
      const summary = m.text.replace(/[\r\n]+/g, ' ').slice(0, 45) + (m.text.length > 45 ? '...' : '');
      lines.push(`| \`${m.id}\` | \`${m.from}\` | \`${m.to}\` | \`${m.type}\` | \`${m.status}\` | ${m.timestamp.slice(0, 16)} | ${summary} |`);
    }
    lines.push('');
  }

  fs.writeFileSync(BRIDGE_FILE, lines.join('\n'), 'utf8');
}

/**
 * Displays CLI usage.
 */
function showHelp() {
  console.log(`
Agent Bridge: Bi-directional messaging between Claude Code CLI & Antigravity CLI

Commands:
  send --from <agy|claude> --to <claude|agy> [--type <task|review|question|status>] "<message>"
      Post a new message or handoff directive to the counterpart harness.

  read [--for <agy|claude>]
      Display pending messages for the specified harness (or all if omitted).

  ack [--for <agy|claude>] [--id <msg_id>]
      Mark pending messages as acknowledged/read.

  prompt --for <claude|agy>
      Generate a copy-pasteable prompt to kick off the counterpart session.

  status
      Summary of current bridge queue, uncommitted git state, and open PLAN.md items.
`);
}

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '--help' || command === '-h') {
  showHelp();
  process.exit(0);
}

const state = loadState();

if (command === 'send') {
  const fromIdx = args.indexOf('--from');
  const toIdx = args.indexOf('--to');
  const typeIdx = args.indexOf('--type');

  const from = fromIdx !== -1 ? args[fromIdx + 1] : null;
  const to = toIdx !== -1 ? args[toIdx + 1] : null;
  const type = typeIdx !== -1 ? args[typeIdx + 1] : 'task';

  // Find message text (first positional arg after subcommands/flags)
  const nonFlags = args.slice(1).filter((a, i, arr) => {
    const prev = arr[i - 1];
    return !a.startsWith('--') && (!prev || !prev.startsWith('--'));
  });
  const text = nonFlags.join(' ');

  if (!from || !to || !text) {
    console.error('❌ Missing arguments. Usage: node tools/agent-bridge.js send --from <agy|claude> --to <claude|agy> "<message>"');
    process.exit(1);
  }

  const msgId = `msg-${Date.now().toString(36)}`;
  const newMsg = {
    id: msgId,
    timestamp: new Date().toISOString(),
    from: from.toLowerCase(),
    to: to.toLowerCase(),
    type,
    text,
    status: 'pending'
  };

  state.messages.push(newMsg);
  saveState(state);

  console.log(`\n======================================================`);
  console.log(`📬 Message posted to Bridge [${msgId}]`);
  console.log(`   From: ${from.toUpperCase()} ➔ To: ${to.toUpperCase()} (${type})`);
  console.log(`------------------------------------------------------`);
  console.log(`Message: "${text}"`);
  console.log(`------------------------------------------------------`);
  console.log(`💡 To resume in ${to.toUpperCase()} CLI:`);
  if (to.toLowerCase() === 'claude') {
    console.log(`   Run in terminal: claude`);
    console.log(`   Prompt: "Run 'node tools/agent-bridge.js read --for claude' to see latest handoff directives."`);
  } else {
    console.log(`   Run in terminal: agy`);
    console.log(`   Prompt: "Run 'node tools/agent-bridge.js read --for agy' to see latest handoff directives."`);
  }
  console.log(`======================================================\n`);
  process.exit(0);
}

if (command === 'read') {
  const forIdx = args.indexOf('--for');
  const target = forIdx !== -1 ? args[forIdx + 1].toLowerCase() : null;

  const pending = state.messages.filter((m) => m.status === 'pending' && (!target || m.to === target));

  if (pending.length === 0) {
    console.log(target ? `✅ No pending messages for ${target.toUpperCase()}.` : '✅ No pending messages on the bridge.');
  } else {
    console.log(`\n📬 Found ${pending.length} pending message(s)${target ? ` for ${target.toUpperCase()}` : ''}:`);
    for (const m of pending) {
      console.log(`\n--- [${m.id}] From ${m.from.toUpperCase()} (${m.type}) at ${m.timestamp} ---`);
      console.log(m.text);
    }
    console.log('\n💡 Use `node tools/agent-bridge.js ack' + (target ? ` --for ${target}` : '') + '` to mark read.\n');
  }
  process.exit(0);
}

if (command === 'ack') {
  const forIdx = args.indexOf('--for');
  const idIdx = args.indexOf('--id');
  const target = forIdx !== -1 ? args[forIdx + 1].toLowerCase() : null;
  const msgId = idIdx !== -1 ? args[idIdx + 1] : null;

  let count = 0;
  for (const m of state.messages) {
    if (m.status === 'pending') {
      if (msgId && m.id === msgId) {
        m.status = 'read';
        count++;
      } else if (!msgId && (!target || m.to === target)) {
        m.status = 'read';
        count++;
      }
    }
  }

  saveState(state);
  console.log(`✅ Acknowledged ${count} message(s).`);
  process.exit(0);
}

if (command === 'status') {
  const pendingAgy = state.messages.filter((m) => m.status === 'pending' && m.to === 'agy').length;
  const pendingClaude = state.messages.filter((m) => m.status === 'pending' && m.to === 'claude').length;
  const dirty = sh('git status --porcelain').split('\n').filter(Boolean).length;
  const branch = sh('git rev-parse --abbrev-ref HEAD');

  console.log(`\n🌉 Agent Bridge Status:`);
  console.log(`   - Branch: ${branch}`);
  console.log(`   - Uncommitted files: ${dirty}`);
  console.log(`   - Pending messages for Antigravity (agy): ${pendingAgy}`);
  console.log(`   - Pending messages for Claude Code (claude): ${pendingClaude}`);
  console.log(`   - Total messages logged: ${state.messages.length}`);
  console.log(`   - State file: .agents/bridge-state.json`);
  console.log(`   - Markdown overview: .agents/BRIDGE.md\n`);
  process.exit(0);
}

if (command === 'prompt') {
  const forIdx = args.indexOf('--for');
  const target = forIdx !== -1 ? args[forIdx + 1].toLowerCase() : 'claude';
  const sender = target === 'claude' ? 'agy' : 'claude';

  const pending = state.messages.filter((m) => m.status === 'pending' && m.to === target);
  const lastCommit = sh('git log -1 --oneline');
  const branch = sh('git rev-parse --abbrev-ref HEAD');

  console.log(`\n================ Copy below into ${target.toUpperCase()} CLI ================`);
  console.log(`Resuming ${target.toUpperCase()} session on branch '${branch}' (commit: ${lastCommit}).`);
  if (pending.length > 0) {
    console.log(`\nDirectives from ${sender.toUpperCase()}:`);
    for (const m of pending) {
      console.log(`- [${m.type.toUpperCase()}] ${m.text}`);
    }
  } else {
    console.log(`\nNo pending directives on the bridge. Run 'node tools/agent-bridge.js status' to check state.`);
  }
  console.log(`\nContext: Read CONTEXT.md and PLAN.md for current progress.`);
  console.log(`=================================================================\n`);
  process.exit(0);
}

console.error(`Unknown command: ${command}. Run with --help.`);
process.exit(1);
