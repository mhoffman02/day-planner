#!/usr/bin/env node
// @file Mechanical checks for the handoff skill's Step 5.2 (validate every claim), run before the handoff commit.
// Checks HANDOFF.md and the tracker docs for:
//   1. open `- [ ]` items whose due date is before today (write deadlines as "due YYYY-MM-DD"; items already
//      marked OVERDUE are skipped),
//   2. pointers in HANDOFF.md to files that don't exist or lines past the end of the file,
//   3. a missing branch stamp, or a stamp whose base is neither HEAD nor (after the handoff commit) HEAD^,
//   4. TODO.md sections with open items that HANDOFF.md never mentions,
//   5. secrets (tokens, keys, private-key blocks) in any of these docs,
//   6. a generated .agents/skills/handoff/SKILL.md older than the user skill (tools/sync-handoff-skill.js).
// Judgment checks (conflicts with existing code, unstated choices) stay with the skill's fresh-eyes review.
//
// Usage: node tools/check-handoff.js   (exit 1 and list file:line for every problem)

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { run as checkSkillSync } from './sync-handoff-skill.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DUE_RE = /\b(?:due|by|on|before|until|expires?|deadline|next)\b[\s:]*(\d{4}-\d{2}-\d{2})/i;

/** Today as YYYY-MM-DD in local time (never toISOString: UTC can be a day off). */
export function localToday(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Open checklist items (with their continuation lines) whose due date is before `today`. */
export function overdueItems(markdown, today) {
  const lines = markdown.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*- \[ \]/.test(lines[i])) continue;
    let text = lines[i];
    for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]) && !/^\s*- /.test(lines[j]); j++) {
      text += ' ' + lines[j].trim();
    }
    if (/OVERDUE/i.test(text)) continue;
    const m = text.match(DUE_RE);
    if (m && m[1] < today) hits.push({ line: i + 1, date: m[1], text: lines[i].trim() });
  }
  return hits;
}

const PATH_TOKEN_RE = /^([\w.~/-]+\.[A-Za-z]{1,5})(?::(\d+))?$/;

function lineCount(file) {
  const text = fs.readFileSync(file, 'utf8');
  return text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
}

function resolvePointer(p, { root: base, mainCheckout }) {
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  if (path.isAbsolute(p)) {
    if (mainCheckout && p.startsWith(mainCheckout + '/')) return path.join(base, p.slice(mainCheckout.length + 1));
    return p;
  }
  return path.join(base, p);
}

/** File pointers (backticked paths, `path:line`, file:// links with #Lnn) that don't resolve. */
export function missingPointers(markdown, opts) {
  const problems = [];
  markdown.split('\n').forEach((text, idx) => {
    const found = [];
    for (const m of text.matchAll(/`([^`\s]+)`/g)) {
      const t = m[1].match(PATH_TOKEN_RE);
      if (!t || !(t[1].includes('/') || t[1].endsWith('.md'))) continue;
      found.push({ at: m.index, file: t[1], line: t[2], label: m[1] });
    }
    for (const m of text.matchAll(/file:\/\/(\/[^)\s#]+)(?:#L(\d+))?/g)) {
      const rel = opts.mainCheckout && m[1].startsWith(opts.mainCheckout + '/') ? m[1].slice(opts.mainCheckout.length + 1) : m[1];
      found.push({ at: m.index, file: m[1], line: m[2], label: m[2] ? `${rel}#L${m[2]}` : rel });
    }
    found.sort((a, b) => a.at - b.at);
    for (const f of found) {
      const abs = resolvePointer(f.file, opts);
      const ok = fs.existsSync(abs) && (!f.line || (fs.statSync(abs).isFile() && Number(f.line) <= lineCount(abs)));
      if (!ok) problems.push({ line: idx + 1, pointer: f.label });
    }
  });
  return problems;
}

/** The stamp's base must be HEAD (before the handoff commit) or HEAD^ (HEAD is the commit that wrote HANDOFF.md). */
export function stampProblems(markdown, { head, headParent, headTouchesHandoff }) {
  const m = markdown.match(/<!--\s*handoff:[^>]*\bbase=([0-9a-f]+)/);
  if (!m) return ['no stamp line (<!-- handoff: ... base=<sha> written=<time> -->)'];
  const base = m[1];
  if (head.startsWith(base)) return [];
  if (headTouchesHandoff && headParent.startsWith(base)) return [];
  return [`stamp base ${base} is not HEAD ${head.slice(0, 12)}: commit everything else first, then re-stamp`];
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** TODO.md `## ` sections with open items that the handoff never names (by "Phase N", else the heading). */
export function uncoveredSections(todoMarkdown, handoffMarkdown) {
  const missing = [];
  for (const block of todoMarkdown.split(/^## /m).slice(1)) {
    const heading = block.split('\n')[0].trim();
    if (!/^\s*- \[ \]/m.test(block)) continue;
    const key = (heading.match(/Phase\s+\d+/i) || [heading.split(':')[0].trim()])[0];
    if (!new RegExp(`\\b${escapeRe(key)}\\b`, 'i').test(handoffMarkdown)) missing.push(key);
  }
  return missing;
}

const SECRET_PATTERNS = [
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_\w{20,}/],
  ['API key (sk-)', /\bsk-[A-Za-z0-9_-]{20,}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Google OAuth token', /\bya29\.[\w-]{20,}|\b1\/\/0[\w-]{20,}/],
  ['Slack token', /\bxox[abprs]-[\w-]{10,}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['credential field', /"(?:client_secret|refresh_token|access_token|password)"\s*:\s*"[^"]{8,}"/]
];

/** Lines that look like they hold a secret. Reports the kind only, never the text. */
export function secretHits(text) {
  const hits = [];
  text.split('\n').forEach((line, idx) => {
    const hit = SECRET_PATTERNS.find(([, re]) => re.test(line));
    if (hit) hits.push({ line: idx + 1, kind: hit[0] });
  });
  return hits;
}

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

export function run() {
  const read = (f) => (fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf8') : null);
  const handoff = read('HANDOFF.md');
  if (handoff === null) throw new Error('check-handoff: HANDOFF.md not found at ' + root);
  const problems = [];
  const today = localToday();

  for (const f of ['TODO.md', 'PLAN.md']) {
    const text = read(f);
    if (text === null) continue;
    for (const h of overdueItems(text, today)) problems.push(`${f}:${h.line}: overdue (due ${h.date}), mark it OVERDUE and name the first action: ${h.text}`);
  }

  const mainCheckout = git('worktree', 'list', '--porcelain').split('\n')[0].replace(/^worktree /, '');
  for (const p of missingPointers(handoff, { root, mainCheckout })) problems.push(`HANDOFF.md:${p.line}: pointer does not resolve: ${p.pointer}`);

  const head = git('rev-parse', 'HEAD');
  const headParent = git('rev-parse', 'HEAD^');
  const headTouchesHandoff = git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').split('\n').includes('HANDOFF.md');
  for (const p of stampProblems(handoff, { head, headParent, headTouchesHandoff })) problems.push(`HANDOFF.md:1: ${p}`);

  const todo = read('TODO.md');
  if (todo !== null) for (const s of uncoveredSections(todo, handoff)) problems.push(`HANDOFF.md: TODO.md section "${s}" has open items but is not mentioned`);

  for (const f of ['HANDOFF.md', 'TODO.md', 'PLAN.md', 'LEARNINGS.md', 'TODO_HISTORY.md']) {
    const text = read(f);
    if (text === null) continue;
    for (const h of secretHits(text)) problems.push(`${f}:${h.line}: possible secret (${h.kind}), replace with [REDACTED]`);
  }

  if (checkSkillSync({ check: true }) !== 0) problems.push('.agents/skills/handoff/SKILL.md is older than the user skill');

  if (problems.length) {
    console.error(`❌ check-handoff: ${problems.length} problem(s):\n  ` + problems.join('\n  '));
    return 1;
  }
  console.log('✅ check-handoff: stamp, pointers, open sections, due dates and secrets all OK.');
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = run();
}
