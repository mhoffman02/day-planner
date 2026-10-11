/**
 * @file indexManifestRewrite.test.js
 * @description Runs the inline manifest start_url rewrite from gas-app/Index.html in a vm and checks it parses the
 * data: manifest (live /dev logged "start_url rewrite failed" because the prefix slice was off by two).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../gas-app/Index.html', import.meta.url), 'utf8');

function manifestHref() {
  const m = html.match(/<link rel="manifest" id="manifest-link" href="([^"]+)">/);
  assert.ok(m, 'manifest link not found in Index.html');
  return m[1];
}

function rewriteScript() {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(s => s[1]);
  const src = scripts.find(s => s.includes('manifest-link'));
  assert.ok(src, 'manifest rewrite script not found in Index.html');
  return src;
}

test('Index.html manifest rewrite parses the data: manifest and sets start_url', () => {
  const link = { href: manifestHref(), getAttribute() { return manifestHref(); } };
  const errors = [];
  let blobText = null;
  const ctx = {
    window: { location: { href: 'https://script.google.com/macros/s/X/dev' } },
    document: { getElementById: id => (id === 'manifest-link' ? link : null) },
    console: { error: (...a) => errors.push(a.join(' ')) },
    Blob: class { constructor(parts) { blobText = parts.join(''); } },
    URL: { createObjectURL: () => 'blob:rewritten' },
    JSON,
    decodeURIComponent,
  };
  vm.runInNewContext(rewriteScript(), ctx);
  assert.deepEqual(errors, []);
  assert.equal(link.href, 'blob:rewritten');
  const manifest = JSON.parse(blobText);
  assert.equal(manifest.name, 'Day Planner');
  assert.equal(manifest.start_url, 'https://script.google.com/macros/s/X/dev');
});
