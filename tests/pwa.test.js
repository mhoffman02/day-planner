/**
 * @file pwa.test.js
 * @description Unit test coverage for PWA manifest.json validity, service worker asset listing, and server routing.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServer } from '../server.js';
import { computeCacheName, readCurrentCacheName } from '../tools/update-sw-cache-version.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

describe('PWA Manifest Validity Tests', () => {
  const manifestPath = path.join(projectRoot, 'manifest.json');

  it('should exist and parse as valid JSON', () => {
    assert.ok(fs.existsSync(manifestPath), 'manifest.json file should exist');
    const content = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(content);
    assert.ok(manifest, 'manifest object should be valid');
  });

  it('should contain required PWA metadata properties', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.name, 'Day Planner');
    assert.equal(manifest.short_name, 'Day Planner');
    // Relative, not root-absolute: this app is served from a GitHub Pages project
    // subpath (/day-planner/), not domain root, so start_url/scope must resolve
    // relative to manifest.json's own location rather than the origin root.
    assert.equal(manifest.start_url, '.');
    assert.equal(manifest.scope, '.');
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.theme_color, 'theme_color should be defined');
    assert.ok(manifest.background_color, 'background_color should be defined');
  });

  it('should specify valid icon entries', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'icons array must not be empty');
    manifest.icons.forEach(icon => {
      assert.ok(icon.src, 'icon src should be defined');
      assert.ok(icon.sizes, 'icon sizes should be defined');
      assert.ok(icon.type, 'icon type should be defined');
      
      const relativeIconPath = icon.src.replace(/^\//, '');
      const iconFilePath = path.join(projectRoot, relativeIconPath);
      assert.ok(fs.existsSync(iconFilePath), `Icon file ${relativeIconPath} should exist on disk`);
    });
  });

  it('should define navigation shortcuts', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.ok(Array.isArray(manifest.shortcuts), 'shortcuts should be an array');
    const urls = manifest.shortcuts.map(s => s.url);
    assert.ok(urls.includes('?view=daily'), 'shortcuts should include daily view');
    assert.ok(urls.includes('?view=monthly'), 'shortcuts should include monthly view');
    assert.ok(urls.includes('?view=tasks'), 'shortcuts should include master tasks view');
  });
});

describe('Service Worker Asset Listing Tests', () => {
  const swPath = path.join(projectRoot, 'sw.js');

  it('should exist and define CACHE_NAME', () => {
    assert.ok(fs.existsSync(swPath), 'sw.js file should exist');
    const content = fs.readFileSync(swPath, 'utf8');
    assert.match(content, /const CACHE_NAME = ['"][^'"]+['"];/, 'CACHE_NAME should be declared');
  });

  it('should list pre-cached assets and all listed assets must exist on disk', () => {
    const content = fs.readFileSync(swPath, 'utf8');
    const match = content.match(/const ASSETS_TO_CACHE = \[([\s\S]*?)\];/);
    assert.ok(match, 'ASSETS_TO_CACHE array should be found in sw.js');

    const assetEntries = match[1]
      .split('\n')
      .map(line => line.trim().replace(/^['"]|['"],?$/g, ''))
      .filter(line => line && !line.startsWith('//'));

    assert.ok(assetEntries.length > 0, 'ASSETS_TO_CACHE should contain asset paths');

    assetEntries.forEach(assetPath => {
      let relativePath = assetPath.replace(/^\//, '');
      if (relativePath === '') relativePath = 'index.html';

      const filePath = path.join(projectRoot, relativePath);
      assert.ok(fs.existsSync(filePath), `Service worker cached asset "${assetPath}" must exist on disk at ${filePath}`);
    });
  });

  it('CACHE_NAME should match the content hash of ASSETS_TO_CACHE (see tools/update-sw-cache-version.js)', () => {
    const content = fs.readFileSync(swPath, 'utf8');
    assert.equal(
      readCurrentCacheName(content),
      computeCacheName(content),
      'sw.js CACHE_NAME is stale relative to its cached assets — run: npm run build:sw'
    );
  });
});

describe('PWA Configuration & Server Routing Tests', () => {
  let server;
  let baseUrl;

  before(async () => {
    server = createServer();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  function fetchRoute(pathname) {
    return new Promise((resolve, reject) => {
      const req = http.get(`${baseUrl}${pathname}`, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, headers: res.headers, body });
        });
      });
      req.on('error', reject);
    });
  }

  it('should serve / with status 200 and text/html content type', async () => {
    const res = await fetchRoute('/');
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.body, /<title>Day Planner<\/title>/);
  });

  it('should serve /manifest.json with status 200 and json content type', async () => {
    const res = await fetchRoute('/manifest.json');
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /application\/(json|manifest\+json)/);
    const json = JSON.parse(res.body);
    assert.equal(json.short_name, 'Day Planner');
  });

  it('should serve /sw.js with status 200 and javascript content type', async () => {
    const res = await fetchRoute('/sw.js');
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /application\/javascript/);
    assert.match(res.body, /ASSETS_TO_CACHE/);
  });

  it('should serve PWA icon at /icons/icon.svg with status 200', async () => {
    const res = await fetchRoute('/icons/icon.svg');
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /image\/svg\+xml/);
  });

  it('should return status 404 for missing static routes', async () => {
    const res = await fetchRoute('/nonexistent-pwa-route.file');
    assert.equal(res.statusCode, 404);
  });
});
