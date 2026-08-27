/**
 * @file gasAppBundleAssembly.test.js
 * @description Regression coverage for gas-app/Code.gs's getCompiledAppBundle(), the endpoint
 * the Universal PWA Shell fetches to mount Day Planner. This logic can't be imported directly
 * (it's server-side GAS, not an ES module), so this test ports the same string-processing steps
 * and asserts the invariant a prior bug violated: Script.html's code must appear in the bundle
 * exactly once. If getCompiledAppBundle() ever regresses to evaluating Index.html's template
 * (which executes the `<?!= include('Script'); ?>` scriptlet) instead of stripping it, Script.html
 * would be embedded a second time inside bundle.html on top of the separate bundle.script field.
 * The shell concatenates inline scripts from bundle.html with bundle.script into one <script> tag
 * at mount time, so a duplicate embed causes Script.html's top-level `const`/`function`
 * declarations to throw "Identifier has already been declared" — a fatal SyntaxError that
 * silently kills the entire combined script, including the Alpine.data('plannerApp', ...)
 * registration at the bottom (surfaces as "plannerApp is not defined" for every x-data binding).
 * See the commit that fixed this (gas-app/Code.gs's getCompiledAppBundle) for the original incident.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAS_APP_DIR = path.join(__dirname, '..', 'gas-app');

// Identifiers declared at Script.html's top level (inside its wrapping IIFE) that must never
// appear anywhere in bundle.html — their presence there means Script.html got embedded twice.
const SCRIPT_ONLY_IDENTIFIERS = ['STATUS_LIST', 'parseTaskTitle', 'class GASBridge', '_registerPlannerApp'];

function readGasAppFile(name) {
  return readFileSync(path.join(GAS_APP_DIR, name), 'utf8');
}

// Mirrors gas-app/Code.gs's getCompiledAppBundle(): read Index.html raw (unevaluated) and
// hand-strip the Styles/Script scriptlets, resolving only the About include. Kept in sync by
// hand per .claude/rules/sync-src-and-gas-app.md's model — if Code.gs's regexes change, update
// these too.
function resolveBundleHtml() {
  const indexContent = readGasAppFile('Index.html');
  const aboutContent = readGasAppFile('About.html');
  return indexContent
    .replace(/<\?!= include\(['"]Styles['"]\);\s*\?>/g, '')
    .replace(/<\?!= include\(['"]Script['"]\);\s*\?>/g, '')
    .replace(/<\?!= include\(['"]About['"]\);\s*\?>/g, aboutContent);
}

describe('gas-app PWA shell bundle assembly', () => {
  it('bundle.html (resolved Index.html) contains no leftover GAS scriptlets', () => {
    const html = resolveBundleHtml();
    assert.doesNotMatch(html, /<\?[!=]/, 'unresolved <?!= ... ?> scriptlet leaked into the bundle');
  });

  it('bundle.html does not double-embed Script.html content', () => {
    const html = resolveBundleHtml();
    for (const identifier of SCRIPT_ONLY_IDENTIFIERS) {
      assert.ok(
        !html.includes(identifier),
        `bundle.html contains "${identifier}" — Script.html is being embedded into the HTML ` +
        `payload in addition to the separate bundle.script field, which double-declares its ` +
        `top-level bindings once the shell concatenates the two for execution`
      );
    }
  });

  it('sanity check: template-evaluation (the historical bug) would have failed this check', () => {
    // Simulate what HtmlService template.evaluate() would have produced instead of the
    // hand-stripping above (the actual pre-fix behavior), to prove the assertion above has teeth.
    const scriptContent = readGasAppFile('Script.html');
    const templateEvaluatedHtml = readGasAppFile('Index.html').replace(
      /<\?!= include\(['"]Script['"]\);\s*\?>/g,
      scriptContent
    );
    assert.ok(templateEvaluatedHtml.includes('STATUS_LIST'), 'expected buggy-path simulation to contain the leaked identifier');
  });

  it('the combined script the shell executes (inline <script> blocks from bundle.html + bundle.script) parses without a duplicate-declaration SyntaxError', () => {
    const html = resolveBundleHtml();
    const scriptContent = readGasAppFile('Script.html');

    const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
      .map((m) => m[1]);

    const bundleScript = scriptContent.replace(/^<script[^>]*>/i, '').replace(/<\/script>\s*$/i, '');
    const combined = [...inlineScripts, bundleScript].join('\n');

    assert.doesNotThrow(
      () => new vm.Script(combined, { filename: 'shell-combined-bundle.js' }),
      'combined script failed to parse — likely a duplicate top-level declaration from a double-embedded Script.html'
    );
  });

  it("Script.html's own top-level code is wrapped in an IIFE (defense-in-depth against future double-inclusion)", () => {
    const scriptContent = readGasAppFile('Script.html');
    const body = scriptContent.replace(/^<script>\s*/, '').replace(/<\/script>\s*$/, '');
    assert.match(body.trimStart(), /^\(function\s*\(\s*\)\s*\{/, 'Script.html body should open with an IIFE');
    assert.match(body.trimEnd(), /\}\)\(\);\s*$/, 'Script.html body should close the IIFE');

    // Even if some future change re-introduces a duplicate embed, the IIFE should make it
    // merely wasteful rather than a fatal SyntaxError.
    assert.doesNotThrow(() => new vm.Script(body + '\n' + body, { filename: 'Script.html x2' }));
  });
});
