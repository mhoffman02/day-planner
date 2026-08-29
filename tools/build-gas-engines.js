/**
 * @file build-gas-engines.js
 * @description Regenerates the AUTO-GENERATED engine block inside gas-app/Script.html from
 * src/taskEngine.js, src/futureMatrixEngine.js, src/syncEngine.js, and
 * src/binderStore.js#getLocalDateStr, via esbuild. HtmlService can't `import` ES modules, so
 * this bundles them into flat top-level declarations and splices the result between the
 * START/END markers in Script.html, which are inside its own wrapping IIFE.
 *
 * Usage:
 *   node tools/build-gas-engines.js          # regenerate in place
 *   node tools/build-gas-engines.js --check  # exit 1 if Script.html is stale (pre-commit gate)
 *
 * See .agents/rules/sync-src-and-gas-app.md. This does NOT (yet) cover src/indexedDbStore.js or
 * src/gasBridge.js — both are still hand-duplicated in gas-app/Script.html. indexedDbStore.js's
 * shape has since been reconciled by hand (generic storeName-keyed API, memory-fallback branch,
 * 5-store schema on both sides), so it's now a mechanically-safe candidate for this build step;
 * gasBridge.js's copy still diverges (mock data, google.script.run branching) and needs its own
 * reconciliation pass first.
 */

import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const entryPath = path.join(rootDir, 'tools/gas-build/engines-entry.js');
const scriptHtmlPath = path.join(rootDir, 'gas-app/Script.html');

const START_MARKER = '  // === GENERATED begin: src/ engine bundle — regenerate with `node tools/build-gas-engines.js`, do not hand-edit ===';
const END_MARKER = '  // === GENERATED end: src/ engine bundle ===';

async function generateBody() {
  const result = await build({
    entryPoints: [entryPath],
    bundle: true,
    format: 'esm',
    write: false,
    // Script.html runs client-side in the user's own browser (not old GAS server JS), so no
    // need to transpile modern syntax like optional chaining down to uglier ES2019 shims.
    target: 'es2020',
    legalComments: 'none',
    charset: 'utf8',
  });

  const raw = result.outputFiles[0].text;
  const exportIdx = raw.indexOf('\nexport {');
  if (exportIdx === -1) {
    throw new Error('build-gas-engines: expected a trailing `export { ... };` block in esbuild ESM output, none found');
  }
  const body = raw.slice(0, exportIdx).trimEnd();
  return body
    .split('\n')
    .map((line) => (line.length ? `  ${line}` : line))
    .join('\n');
}

async function main() {
  const indentedBody = await generateBody();
  const generatedBlock = [
    START_MARKER,
    '  // Source of truth: src/taskEngine.js, src/futureMatrixEngine.js, src/syncEngine.js,',
    "  // src/binderStore.js#getLocalDateStr. See .agents/rules/sync-src-and-gas-app.md.",
    indentedBody,
    END_MARKER,
  ].join('\n');

  const scriptHtml = fs.readFileSync(scriptHtmlPath, 'utf8');
  const startIdx = scriptHtml.indexOf(START_MARKER);
  const endIdx = scriptHtml.indexOf(END_MARKER);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('build-gas-engines: could not find GENERATED begin/end markers in gas-app/Script.html');
  }
  const before = scriptHtml.slice(0, startIdx);
  const after = scriptHtml.slice(endIdx + END_MARKER.length);
  const updated = before + generatedBlock + after;

  const checkOnly = process.argv.includes('--check');
  if (checkOnly) {
    if (updated !== scriptHtml) {
      console.error('gas-app/Script.html engine bundle is stale relative to src/ — run `node tools/build-gas-engines.js`.');
      process.exitCode = 1;
      return;
    }
    console.log('gas-app/Script.html engine bundle is up to date.');
    return;
  }

  if (updated === scriptHtml) {
    console.log('gas-app/Script.html engine bundle already up to date, nothing to do.');
    return;
  }
  fs.writeFileSync(scriptHtmlPath, updated, 'utf8');
  console.log('Regenerated gas-app/Script.html engine bundle from src/.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
