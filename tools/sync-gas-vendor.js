/**
 * @file sync-gas-vendor.js
 * @description Auto-generated JSDoc header for sync-gas-vendor.js.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const picoPath = path.join(rootDir, 'src/vendor/pico.min.css');
const alpinePath = path.join(rootDir, 'src/vendor/alpine.min.js');

const stylesPath = path.join(rootDir, 'gas-app/Styles.html');
const scriptPath = path.join(rootDir, 'gas-app/Script.html');

const picoCss = fs.readFileSync(picoPath, 'utf8');
const alpineJs = fs.readFileSync(alpinePath, 'utf8');

// 1. Sync Pico CSS into gas-app/Styles.html
let stylesContent = fs.readFileSync(stylesPath, 'utf8');
const cdnPicoImport = "@import url('https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css');";
if (stylesContent.includes(cdnPicoImport)) {
  stylesContent = stylesContent.replace(cdnPicoImport, `/* Inlined Local Pico CSS v2 */\n${picoCss}`);
  fs.writeFileSync(stylesPath, stylesContent, 'utf8');
  console.log('[Sync] Successfully inlined local pico.min.css into gas-app/Styles.html');
} else {
  console.log('[Sync] gas-app/Styles.html already has inlined Pico CSS or updated import');
}

// 2. Sync Alpine JS into gas-app/Script.html
let scriptContent = fs.readFileSync(scriptPath, 'utf8');
const cdnAlpineTag = '<script src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js" defer></script>';
if (scriptContent.includes(cdnAlpineTag)) {
  scriptContent = scriptContent.replace(cdnAlpineTag, `<script>\n/* Inlined Local Alpine JS 3.x */\n${alpineJs}\n</script>`);
  fs.writeFileSync(scriptPath, scriptContent, 'utf8');
  console.log('[Sync] Successfully inlined local alpine.min.js into gas-app/Script.html');
} else {
  console.log('[Sync] gas-app/Script.html already has inlined Alpine JS');
}
