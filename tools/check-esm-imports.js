#!/usr/bin/env node
/**
 * @file tools/check-esm-imports.js
 * @description Validates that all relative import/export specifiers in JS files have explicit .js extensions.
 * In native browser ES modules and Node.js with "type": "module", relative specifiers without extensions fail.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DIRS_TO_SCAN = ['src', 'tests', 'tools'];
const IMPORT_EXPORT_REGEX = /(?:import|export)\s+(?:[\w*\s{},]*\s+from\s+)?['"](\.[^'"]+)['"]/g;

let errors = 0;
let filesChecked = 0;

/**
 * Recursively find all .js and .mjs files in a directory.
 * @param {string} dir Directory path.
 * @returns {string[]} Array of file paths.
 */
function findJsFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        results.push(...findJsFiles(fullPath));
      }
    } else if (/\.(js|mjs)$/.test(entry.name) && !entry.name.endsWith('.min.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

for (const dirName of DIRS_TO_SCAN) {
  const dirPath = path.join(ROOT, dirName);
  const files = findJsFiles(dirPath);

  for (const file of files) {
    filesChecked++;
    const content = fs.readFileSync(file, 'utf8');
    const relFile = path.relative(ROOT, file);

    let match;
    IMPORT_EXPORT_REGEX.lastIndex = 0;
    while ((match = IMPORT_EXPORT_REGEX.exec(content)) !== null) {
      const specifier = match[1];
      if (!specifier.endsWith('.js') && !specifier.endsWith('.mjs') && !specifier.endsWith('.json')) {
        console.error(`❌ [ESM SPECIFIER] ${relFile}: relative import/export '${specifier}' missing explicit .js extension.`);
        errors++;
      }
    }
  }
}

if (errors > 0) {
  console.error(`\n❌ Found ${errors} relative import(s) missing explicit file extensions across ${filesChecked} files.`);
  process.exit(1);
} else {
  console.log(`✅ All relative imports in ${filesChecked} files have explicit .js extensions.`);
  process.exit(0);
}
