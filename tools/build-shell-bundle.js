/**
 * @file build-shell-bundle.js
 * @description Compiles the Day Planner application assets into a built-in offline bundle for the Universal PWA Shell.
 * Eliminates cross-origin CORS/401 hurdles on first launch while preserving background SWR hot-updates.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function buildBundle() {
  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'gas-app/Index.html'), 'utf8');
  const stylesHtml = fs.readFileSync(path.join(ROOT_DIR, 'gas-app/Styles.html'), 'utf8');
  const scriptHtml = fs.readFileSync(path.join(ROOT_DIR, 'gas-app/Script.html'), 'utf8');

  // Clean and prepare HTML markup
  let resolvedHtml = indexHtml
    .replace(/<\?!= include\(['"]Styles['"]\); \?>/g, '')
    .replace(/<\?!= include\(['"]Script['"]\); \?>/g, '')
    .replace(/<\?!= include\(['"]AlpineJS['"]\); \?>/g, '')
    .replace(/<\?!= include\(['"]PicoCSS['"]\); \?>/g, '');

  const version = '1.3.0';
  const rawPayload = `${version}:${stylesHtml}:${scriptHtml}:${resolvedHtml}`;
  const hash = crypto.createHash('md5').update(rawPayload).digest('base64');

  const bundleObj = {
    version,
    hash,
    timestamp: new Date().toISOString(),
    bundle: {
      title: 'Day Planner',
      themeColor: '#2d6a5a',
      styles: stylesHtml,
      html: resolvedHtml,
      script: scriptHtml
    }
  };

  return bundleObj;
}

export function updateShellPwaJs(targetPwaJsPath) {
  if (!fs.existsSync(targetPwaJsPath)) return;
  const bundle = buildBundle();
  let content = fs.readFileSync(targetPwaJsPath, 'utf8');

  const bundleJson = JSON.stringify(bundle);
  const bundleDeclaration = `// Built-in Default Offline Application Bundles\nconst BUILTIN_BUNDLES = {\n  'day-planner': ${bundleJson},\n  'planner': ${bundleJson}\n};`;

  if (content.includes('const BUILTIN_BUNDLES =')) {
    content = content.replace(/\/\/ Built-in Default Offline Application Bundles[\s\S]*?const BUILTIN_BUNDLES =[\s\S]*?\n\};/, bundleDeclaration);
  } else {
    content = content.replace(/(const STORE_NAME = 'app_bundles';)/, `$1\n\n${bundleDeclaration}`);
  }

  fs.writeFileSync(targetPwaJsPath, content, 'utf8');
  console.log(`[Build Bundle] Injected Day Planner built-in bundle into: ${targetPwaJsPath}`);
}

// Run directly
const targetFiles = [
  path.join(ROOT_DIR, 'gh-pwa-shell/pwa.js'),
  path.resolve(ROOT_DIR, '../shell/pwa.js')
];

for (const target of targetFiles) {
  if (fs.existsSync(target)) {
    updateShellPwaJs(target);
  }
}
