import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

// WCAG 2.2 SC 2.5.8 (axe target-size): pointer targets are at least 24x24 CSS px.
test('--target-min token is defined as 24px', () => {
  assert.match(css, /--target-min:\s*24px;/);
});

test('.color-swatch-btn sizes itself from --target-min, not a literal below 24px', () => {
  const m = css.match(/\.color-swatch-btn\s*\{([^}]*)\}/);
  assert.ok(m, '.color-swatch-btn rule missing');
  assert.match(m[1], /width:\s*var\(--target-min\)/);
  assert.match(m[1], /height:\s*var\(--target-min\)/);
});
