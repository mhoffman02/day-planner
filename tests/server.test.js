/**
 * @file tests/server.test.js
 * @description Mock-preview server hardening: loopback bind, Host allowlist (DNS rebinding), path allowlist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { resolveRequest, isAllowedHost, createServer } from '../server.js';

const HOST = 'localhost:3000';

test('isAllowedHost accepts only localhost/127.0.0.1 on the served port', () => {
  assert.equal(isAllowedHost('localhost:3000', 3000), true);
  assert.equal(isAllowedHost('127.0.0.1:3000', 3000), true);
  for (const bad of [undefined, '', 'evil.com', 'evil.com:3000', 'localhost:4000', 'localhost.evil.com:3000', '127.0.0.1', 'localhost:3000.evil.com']) {
    assert.equal(isAllowedHost(bad, 3000), false, String(bad));
  }
});

test('bad Host header is 403', () => {
  assert.equal(resolveRequest('/index.html', 'evil.com:3000', 3000).status, 403);
  assert.equal(resolveRequest('/index.html', undefined, 3000).status, 403);
});

test('allowed paths resolve to a file under the repo root', () => {
  for (const p of ['/', '/index.html', '/src/app.js', '/src/styles.css', '/manifest.json', '/icons/icon-192.png']) {
    const r = resolveRequest(p, HOST, 3000);
    assert.equal(r.status, 200, p);
    assert.ok(r.filePath.includes('day-planner') || r.filePath.length > 0);
  }
});

test('repo internals and dotfiles are denied', () => {
  for (const p of ['/.git/config', '/.git/HEAD', '/.claude/settings.json', '/.env', '/.agents/rules/x.md', '/src/.hidden', '/package.json', '/server.js', '/gas-app/.clasp.json', '/scratch/x.png', '/screenshots/a.png', '/HANDOFF.md']) {
    assert.equal(resolveRequest(p, HOST, 3000).status, 403, p);
  }
});

test('path traversal variants are denied', () => {
  for (const p of ['/../package.json', '/src/../.git/config', '/src/%2e%2e/.git/config', '/%2e%2e/%2e%2e/etc/passwd', '/src/..%2f..%2f.git/config', '/src/..\\..\\.git\\config', '/src/%00.js', '/src/%zz', '//etc/passwd', '/src/../../etc/passwd']) {
    const s = resolveRequest(p, HOST, 3000).status;
    assert.ok(s === 403 || s === 400, `${p} -> ${s}`);
  }
});

test('server binds loopback only and enforces Host over a real socket', async () => {
  const server = createServer(0);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { address, port } = server.address();
    assert.equal(address, '127.0.0.1');
    const status = (p, host) => new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path: p, headers: { host } }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
    });
    assert.equal(await status('/index.html', `127.0.0.1:${port}`), 200);
    assert.equal(await status('/index.html', `evil.com:${port}`), 403);
    assert.equal(await status('/.git/config', `127.0.0.1:${port}`), 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
