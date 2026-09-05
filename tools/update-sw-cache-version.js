/**
 * @file update-sw-cache-version.js
 * @description Derives sw.js's CACHE_NAME from a content hash of the files listed in its own
 * ASSETS_TO_CACHE array, so the cache version always reflects what's actually being cached
 * instead of relying on a human remembering to bump a string by hand whenever shell content
 * changes (the exact miss that shipped a stale UI to a real user — see git history around
 * sw.js's CACHE_NAME).
 *
 * Usage:
 *   node tools/update-sw-cache-version.js          # rewrite sw.js's CACHE_NAME in place
 *   node tools/update-sw-cache-version.js --check  # exit 1 if sw.js's CACHE_NAME is stale (pre-commit gate)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const swPath = path.join(projectRoot, 'sw.js');

/** @param {string} swContent Raw contents of sw.js. @returns {string[]} Relative asset paths from ASSETS_TO_CACHE. */
export function readAssetList(swContent) {
  const match = swContent.match(/const ASSETS_TO_CACHE = \[([\s\S]*?)\];/);
  if (!match) throw new Error('ASSETS_TO_CACHE array not found in sw.js');
  return match[1]
    .split('\n')
    .map((line) => line.trim().replace(/^['"]|['"],?$/g, ''))
    .filter((line) => line && !line.startsWith('//'));
}

/** @param {string} swContent Raw contents of sw.js. @returns {string} Current CACHE_NAME value. */
export function readCurrentCacheName(swContent) {
  const match = swContent.match(/const CACHE_NAME = ['"]([^'"]+)['"];/);
  if (!match) throw new Error('CACHE_NAME not found in sw.js');
  return match[1];
}

/**
 * Hashes the concatenated (path, content) pairs of every pre-cached asset, in listed order, so
 * the result changes if any cached file's content changes OR the asset list itself changes.
 * @param {string} [swContent] Raw contents of sw.js (defaults to reading it from disk).
 * @returns {string} A new CACHE_NAME derived purely from current asset content.
 */
export function computeCacheName(swContent = fs.readFileSync(swPath, 'utf8')) {
  const hash = crypto.createHash('sha256');
  for (const assetPath of readAssetList(swContent)) {
    const relativePath = assetPath.replace(/^\.?\/*/, '') || 'index.html';
    const content = fs.readFileSync(path.join(projectRoot, relativePath));
    hash.update(relativePath);
    hash.update('\n');
    hash.update(content);
    hash.update('\n');
  }
  return `day-planner-shell-${hash.digest('hex').slice(0, 10)}`;
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const swContent = fs.readFileSync(swPath, 'utf8');
  const expected = computeCacheName(swContent);
  const current = readCurrentCacheName(swContent);

  if (current === expected) {
    console.log(`sw.js CACHE_NAME is up to date (${current}).`);
    return;
  }

  if (checkOnly) {
    console.error(`sw.js CACHE_NAME is stale: found "${current}", expected "${expected}".`);
    console.error('Run: npm run build:sw');
    process.exit(1);
  }

  const updated = swContent.replace(
    /const CACHE_NAME = ['"][^'"]+['"];/,
    `const CACHE_NAME = '${expected}';`
  );
  fs.writeFileSync(swPath, updated);
  console.log(`sw.js CACHE_NAME updated: "${current}" -> "${expected}".`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
