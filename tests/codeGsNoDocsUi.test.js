/**
 * @file codeGsNoDocsUi.test.js
 * @description Code.gs is a standalone web app, so a Google Docs onOpen menu never fires. Its two sidebars
 * built HTML by concatenating Doc snippets into innerHTML (stored XSS if ever reached) and were exported
 * as client-callable functions. Removed 2026-11-13; this keeps Docs-container UI and innerHTML builders out.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const CODE_GS = process.env.CODE_GS_PATH || path.join(import.meta.dirname, '..', 'gas-app', 'Code.gs');
const src = fs.readFileSync(CODE_GS, 'utf8');

test('Code.gs builds no Docs-container UI (getUi/showSidebar/showModalDialog) and no onOpen menu', () => {
  assert.doesNotMatch(src, /DocumentApp\.getUi|showSidebar\(|showModalDialog\(/);
  assert.doesNotMatch(src, /^function onOpen\b/m);
});

test('Code.gs has no searchAcrossAllMonthlyDocs (its only caller was the removed sidebar)', () => {
  assert.doesNotMatch(src, /searchAcrossAllMonthlyDocs/);
});

test('Code.gs serves no inline script that writes innerHTML', () => {
  assert.doesNotMatch(src, /innerHTML/);
});
