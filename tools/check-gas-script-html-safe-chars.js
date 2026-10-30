#!/usr/bin/env node
// @file Guards every gas-app/*.html file against the exact byte pattern that caused the 2026-09-01
// outage: HtmlService.createHtmlOutputFromFile().getContent() silently truncates the served
// file from the first literal `//` it finds inside a string/template literal — or the first
// backtick/apostrophe/`//` it finds inside a comment — to the end of that source line, even
// mid-statement. Ordinary `//` line comments and `/* */` block comments are unaffected (the
// file has 200+ of them); the trigger is specifically those two character classes landing
// inside a string or a comment. See memory/project_gas_line_comment_syntax_error.md for the
// full empirical writeup.
//
// Every inline <script> block (not only the first, nor only Script.html) and every <style> block's
// CSS comments are checked: until 2026-10-30 only Script.html block 1 was, so the other 6 blocks
// and all CSS were unguarded. Usage: node tools/check-gas-script-html-safe-chars.js [file.html...]
// (default: every gas-app/*.html).

import * as acorn from 'acorn';
import fs from 'fs';
import path from 'path';

const BLOCK_RE = /<(script|style)(\s[^>]*)?>/gi;
// GAS scriptlets (<?= x ?>, <?!= x ?>, <? x ?>) are not JS; blank them to `0`, keeping newlines.
const SCRIPTLET_RE = /<\?[\s\S]*?\?>/g;

/**
 * @param {string} s Text.
 * @returns {string} The comment char HtmlService truncates on, or null.
 */
function badCommentChar(s) {
  if (s.includes('//')) return '//';
  if (s.includes('`')) return 'backtick';
  if (s.includes("'")) return 'apostrophe';
  return null;
}

/**
 * @param {string} code Script body.
 * @param {number} lineBase File line of the body's first line, minus one.
 * @param {Array<object>} out Violations sink.
 * @returns {void}
 */
function checkScript(code, lineBase, out) {
  const js = code.replace(SCRIPTLET_RE, (m) => '0' + m.replace(/[^\n]/g, ''));
  const comments = [];
  let tokens;
  try {
    tokens = [...acorn.tokenizer(js, { ecmaVersion: 'latest', locations: true, onComment: comments })];
  } catch (err) {
    out.push({ line: lineBase + 1, kind: `could not tokenize the <script> block (${err.message})`, snippet: '' });
    return;
  }
  for (const t of tokens) {
    if (t.type.label !== 'string' && t.type.label !== 'template') continue;
    const raw = js.slice(t.start, t.end);
    if (raw.includes('//')) out.push({ line: lineBase + t.loc.start.line, kind: '// inside a string/template literal', snippet: raw.slice(0, 60) });
  }
  for (const c of comments) {
    const hit = badCommentChar(c.value);
    if (hit) out.push({ line: lineBase + c.loc.start.line, kind: `${hit} inside a comment`, snippet: c.value.trim().slice(0, 60) });
  }
  // HTML comment markers anywhere in the script (a regex literal included) broke the served page on
  // 2026-10-30: @337 added /<!--[\s\S]*?-->/ and the page never loaded (blank tab, then out of
  // memory). Write them as <!-{2} and -{2}> in a regex instead.
  code.split('\n').forEach((text, n) => {
    if (text.includes('<!--') || text.includes('-->')) {
      out.push({ line: lineBase + n + 1, kind: 'HTML comment marker <!-- or -->', snippet: text.trim().slice(0, 60) });
    }
  });
}

/**
 * @param {string} css Style body.
 * @param {number} lineBase File line of the body's first line, minus one.
 * @param {Array<object>} out Violations sink.
 * @returns {void}
 */
function checkStyle(css, lineBase, out) {
  for (const m of css.matchAll(/\/\*([\s\S]*?)\*\//g)) {
    const hit = badCommentChar(m[1]);
    if (hit) out.push({ line: lineBase + css.slice(0, m.index).split('\n').length, kind: `${hit} inside a CSS comment`, snippet: m[1].trim().slice(0, 60) });
  }
}

/**
 * @param {string} file HTML file path.
 * @returns {Array<object>} Violations with file line numbers.
 */
function checkFile(file) {
  const html = fs.readFileSync(file, 'utf8');
  const out = [];
  BLOCK_RE.lastIndex = 0;
  let m;
  while ((m = BLOCK_RE.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    const bodyStart = m.index + m[0].length;
    const close = html.toLowerCase().indexOf(`</${tag}>`, bodyStart);
    if (close === -1) {
      out.push({ line: html.slice(0, m.index).split('\n').length, kind: `<${tag}> has no closing tag`, snippet: '' });
      break;
    }
    BLOCK_RE.lastIndex = close;
    if (tag === 'script' && /\ssrc\s*=/i.test(m[2] || '')) continue;
    const lineBase = html.slice(0, bodyStart).split('\n').length - 1;
    const body = html.slice(bodyStart, close);
    if (tag === 'script') checkScript(body, lineBase, out);
    else checkStyle(body, lineBase, out);
  }
  return out;
}

const files = process.argv.length > 2
  ? process.argv.slice(2)
  : fs.readdirSync('gas-app').filter((f) => f.endsWith('.html')).sort().map((f) => path.join('gas-app', f));

let failed = 0;
for (const file of files) {
  const violations = checkFile(file).sort((a, b) => a.line - b.line);
  if (violations.length === 0) continue;
  failed += violations.length;
  console.error(`${file}: ${violations.length} violation(s)`);
  for (const v of violations) console.error(`  line ${v.line}: ${v.kind} — ${JSON.stringify(v.snippet)}`);
}

if (failed > 0) {
  console.error(
    '\n❌ Found byte patterns that HtmlService.createHtmlOutputFromFile().getContent() truncates on ' +
      '(see memory/project_gas_line_comment_syntax_error.md). Fix: for a URL string, split the slash ' +
      "(e.g. 'https:' + '/' + '/host...'); for a comment, remove //, backticks, and apostrophes " +
      '(use the typographic ’ or rephrase).'
  );
  process.exit(1);
}
console.log(`✅ ${files.length} gas-app HTML file(s): no unsafe // / backtick / apostrophe patterns in any script or style block.`);
