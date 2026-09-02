#!/usr/bin/env node
// @file Guards gas-app/Script.html against the exact byte pattern that caused the 2026-09-01
// outage: HtmlService.createHtmlOutputFromFile().getContent() silently truncates the served
// file from the first literal `//` it finds inside a string/template literal — or the first
// backtick/apostrophe/`//` it finds inside a comment — to the end of that source line, even
// mid-statement. Ordinary `//` line comments and `/* */` block comments are unaffected (the
// file has 200+ of them); the trigger is specifically those two character classes landing
// inside a string or a comment. See memory/project_gas_line_comment_syntax_error.md for the
// full empirical writeup.
//
// Uses acorn's tokenizer (a real JS lexer, already a transitive devDependency via eslint) so
// this correctly ignores `//` inside regex literals and other non-string/non-comment contexts
// that a naive text scan would misflag.
//
// Usage: node tools/check-gas-script-html-safe-chars.js
// Exits non-zero (and prints every violation) if a forbidden pattern is found in the <script>
// block of gas-app/Script.html — the one file with confirmed empirical proof of both the bug
// and a fully clean fix (see .agents/rules/sync-src-and-gas-app.md's neighbor rule for why this
// is scoped narrowly rather than applied to every gas-app/*.html file).

import * as acorn from 'acorn';
import fs from 'fs';
import path from 'path';

const file = process.argv[2] || path.join('gas-app', 'Script.html');
const html = fs.readFileSync(file, 'utf8');

const startTag = '<script>\n';
const startIdx = html.indexOf(startTag);
const endIdx = html.indexOf('</script>');
if (startIdx === -1 || endIdx === -1) {
  console.error(`${file}: could not find a <script>...</script> block to check`);
  process.exit(1);
}
const codeStart = startIdx + startTag.length;
const code = html.slice(codeStart, endIdx);
const linesBeforeCode = html.slice(0, codeStart).split('\n').length - 1;

const comments = [];
const violations = [];

let tokens;
try {
  tokens = [
    ...acorn.tokenizer(code, { ecmaVersion: 'latest', locations: true, onComment: comments }),
  ];
} catch (err) {
  console.error(`${file}: failed to tokenize <script> block — ${err.message}`);
  process.exit(1);
}

for (const t of tokens) {
  if (t.type.label === 'string' || t.type.label === 'template') {
    const raw = code.slice(t.start, t.end);
    if (raw.includes('//')) {
      violations.push({
        line: linesBeforeCode + t.loc.start.line,
        kind: '// inside a string/template literal',
        snippet: raw.slice(0, 60),
      });
    }
  }
}

for (const c of comments) {
  const hit = c.value.includes('//') ? '//' : c.value.includes('`') ? 'backtick' : c.value.includes("'") ? 'apostrophe' : null;
  if (hit) {
    violations.push({
      line: linesBeforeCode + c.loc.start.line,
      kind: `${hit} inside a comment`,
      snippet: c.value.trim().slice(0, 60),
    });
  }
}

if (violations.length > 0) {
  violations.sort((a, b) => a.line - b.line);
  console.error(`${file}: ${violations.length} violation(s)`);
  for (const v of violations) {
    console.error(`  line ${v.line}: ${v.kind} — ${JSON.stringify(v.snippet)}`);
  }
  console.error(
    '\n❌ Found byte patterns that HtmlService.createHtmlOutputFromFile().getContent() truncates on ' +
      '(see memory/project_gas_line_comment_syntax_error.md). Fix: for a URL string, split the slash ' +
      "(e.g. 'https:' + '/' + '/host...'); for a comment, remove //, backticks, and apostrophes " +
      '(use the typographic ’ or rephrase).'
  );
  process.exit(1);
} else {
  console.log(`✅ ${file}: no unsafe // / backtick / apostrophe patterns found in strings or comments.`);
}
