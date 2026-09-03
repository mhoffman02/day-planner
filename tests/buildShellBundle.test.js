'use strict';

// Regression test for the installed-PWA "blank Help screen" bug: the static offline
// snapshot in gh-pwa-shell/bundles.json is what mounts first (before any live GAS
// connection), but tools/build-shell-bundle.js only stripped the `include('Styles'/'Script'/
// 'AlpineJS'/'PicoCSS')` scriptlets from Index.html -- it never resolved the separate
// `<?!= includeTemplate('About'); ?>` scriptlet that pulls in About.html, so the literal
// unresolved tag landed in the bundle, which browsers silently drop -> an empty About/Help
// view in the installed app while the live script.google.com page (where HtmlService
// actually evaluates it) rendered fine.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBundle } from '../tools/build-shell-bundle.js';

test('buildBundle() resolves the About includeTemplate scriptlet, not the literal tag', () => {
  const { bundle } = buildBundle();
  assert.ok(
    !bundle.html.includes('includeTemplate'),
    'bundle.html must not contain a literal, unresolved includeTemplate(...) scriptlet'
  );
  assert.match(bundle.html, /about-container/, 'expected About.html\'s content to be inlined');
});

test('buildBundle() resolves the getAppVersion() scriptlet inside About.html', () => {
  const { bundle, version } = buildBundle();
  assert.ok(
    !bundle.html.includes('getAppVersion'),
    'bundle.html must not contain a literal, unresolved getAppVersion() scriptlet'
  );
  assert.match(bundle.html, new RegExp(`about-version">v${version}<`));
});
