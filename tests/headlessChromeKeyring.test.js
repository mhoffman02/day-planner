/**
 * @file headlessChromeKeyring.test.js
 * @description 2026-11-12: `npm run smoke` started a headless Linux Chrome that asked the Secret Service for its
 * cookie key, so GNOME showed an anonymous "Unlock Keyring" prompt. Every tool that spawns a throwaway headless
 * Chrome must pass --password-store=basic.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const file of ['tools/smoke-test.js', 'tools/audit-wcag-responsive.js']) {
  test(`${file} spawns headless Chrome with --password-store=basic`, () => {
    const src = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(src, /--headless=new/);
    assert.match(src, /--password-store=basic/);
  });
}
