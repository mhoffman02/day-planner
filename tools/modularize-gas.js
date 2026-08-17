/**
 * @file modularize-gas.js
 * @description Auto-generated JSDoc header for modularize-gas.js.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const stylesCssPath = path.join(rootDir, 'src/styles.css');
const gasStylesPath = path.join(rootDir, 'gas-app/Styles.html');
const gasIndexPath = path.join(rootDir, 'gas-app/Index.html');

// 1. Clean custom styles for gas-app/Styles.html (remove @import './vendor/pico.min.css';)
let customCss = fs.readFileSync(stylesCssPath, 'utf8');
customCss = customCss.replace("@import './vendor/pico.min.css';", '').trim();

fs.writeFileSync(gasStylesPath, `<style>\n/* Custom Day Planner Application Styles */\n${customCss}\n</style>\n`, 'utf8');
console.log('[Modularize] Updated gas-app/Styles.html to contain ONLY custom CSS');

// 2. Clean custom script for gas-app/Script.html (remove inline Alpine vendor JS if present)
const gasScriptPath = path.join(rootDir, 'gas-app/Script.html');
let scriptContent = fs.readFileSync(gasScriptPath, 'utf8');
// Remove AlpineJS block if it was previously inlined
scriptContent = scriptContent.replace(/<script>\s*\/\* Inlined Local Alpine JS 3\.x \*\/[\s\S]*?<\/script>/gi, '').trim();
if (!scriptContent.startsWith('<script>')) {
  scriptContent = `<script>\n${scriptContent}\n</script>`;
}
fs.writeFileSync(gasScriptPath, scriptContent, 'utf8');
console.log('[Modularize] Updated gas-app/Script.html to contain ONLY custom script logic');

// 3. Update gas-app/Index.html to include PicoCSS and AlpineJS separately
let indexHtml = fs.readFileSync(gasIndexPath, 'utf8');

// Ensure head has PicoCSS then Styles
if (!indexHtml.includes("<?!= include('PicoCSS'); ?>")) {
  indexHtml = indexHtml.replace("<?!= include('Styles'); ?>", "<?!= include('PicoCSS'); ?>\n  <?!= include('Styles'); ?>");
}

// Ensure body has AlpineJS then Script
if (!indexHtml.includes("<?!= include('AlpineJS'); ?>")) {
  indexHtml = indexHtml.replace("<?!= include('Script'); ?>", "<?!= include('AlpineJS'); ?>\n  <?!= include('Script'); ?>");
}

fs.writeFileSync(gasIndexPath, indexHtml, 'utf8');
console.log('[Modularize] Updated gas-app/Index.html with modular includes: PicoCSS, Styles, AlpineJS, Script');
