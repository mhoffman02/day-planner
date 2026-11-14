/**
 * @file lightPalette.test.js
 * @description Light mode uses the warm Manila palette (A15): dimmer page and cards, every text token
 * that met WCAG AA on white still meets 4.5:1 on card, page and tint, and inputs outline in
 * --border-input at 3:1 or better (WCAG 1.4.11). Dark mode keeps its old values for shared tokens.
 * Runs against both stylesheet copies.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const FILES = ['src/styles.css', 'gas-app/Styles.html'];

const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255]
    .map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// First block = the light :root token block; the dark palette block follows the Dark Forest banner.
const block = (css, start) => {
  const from = css.indexOf('{', css.indexOf(start)) + 1;
  return css.slice(from, css.indexOf('\n  }', from));
};
const tokens = (body) => Object.fromEntries(
  [...body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2].toLowerCase()]),
);
const lightOf = (css) => tokens(block(css, ':root,'));
const darkOf = (css) => tokens(block(css, ':root[data-theme="dark"],'));

// Shared tokens the light block changed; dark mode must pin their pre-Manila values.
const DARK_PINS = {
  'bg-parchment-fixed': '#fcfbfa',
  'border-default': '#c8ded7',
  'bg-accent-subtle': '#eef6f3',
  'text-muted-fixed': '#5f6b68',
  'danger-2': '#c93b2b',
  'danger-3': '#c62828',
  'text-muted-2': '#5f7a70',
  'text-neutral-muted': '#6b7280',
  'danger-5': '#b33939',
  'text-neutral-muted-2': '#767676',
};

const INPUT_RULES = [
  'textarea', '.task-input-field', 'input.delegate-owner-input',
  'input.future-item-date-input', 'input.master-task-date-input', 'input.search-input-field',
  '.continuous-doc-textarea', '.future-item-input-field', '.master-task-add-bar .master-task-due-date-input',
  '.form-input, .form-select, .form-textarea', '.master-search-input', 'textarea.tutorial-report',
];

test('light tokens match between src/styles.css and gas-app/Styles.html', () => {
  assert.deepEqual(lightOf(read(FILES[1])), lightOf(read(FILES[0])));
  assert.deepEqual(darkOf(read(FILES[1])), darkOf(read(FILES[0])));
});

for (const file of FILES) {
  const css = read(file);
  const t = lightOf(css);

  // User pick 2026-11-14: page and rules 33% of the way from the old near-white to Manila, cards and
  // in-card fills 15% (full Manila #e8e0d0 page / #f2ede3 card was too strong).
  test(`${file}: light page and cards are the light Manila mix`, () => {
    assert.equal(t['bg-parchment'], '#f5f2ec');
    assert.equal(t['bg-parchment-fixed'], '#f5f2ec');
    assert.equal(t['bg-card'], '#fdfcfb');
    assert.equal(t['border-line'], '#cbd5c9');
    assert.equal(t['border-default'], '#cbd5c9');
    assert.equal(t['bg-accent-subtle'], '#edf3ee');
    assert.equal(t['binder-teal-light'], '#e7f3ef');
    assert.equal(t.white, '#ffffff', '--white stays white: it is text on teal');
  });

  test(`${file}: every text token that passed AA on white passes on card, page and tint`, () => {
    const backs = { card: t['bg-card'], page: t['bg-parchment'], tint: t['bg-accent-subtle'] };
    const fails = [];
    for (const [name, hex] of Object.entries(t)) {
      if (!/^(text|heading|binder-teal$|danger|info|priority|status|accent)/.test(name)) continue;
      if (/on-dark|light|focus/.test(name) || ratio(hex, '#ffffff') < 4.5) continue;
      for (const [where, bg] of Object.entries(backs)) {
        const r = ratio(hex, bg);
        if (r < 4.5) fails.push(`--${name} ${hex} on ${where} ${bg}: ${r.toFixed(2)}:1`);
      }
    }
    assert.deepEqual(fails, []);
    assert.ok(ratio(t['binder-teal'], t['binder-teal-light']) >= 4.5, 'teal event text on event fill');
  });

  test(`${file}: input outline token reaches 3:1 on card and on white`, () => {
    assert.ok(t['border-input'], '--border-input defined');
    assert.ok(ratio(t['border-input'], t['bg-card']) >= 3);
    assert.ok(ratio(t['border-input'], t.white) >= 3);
  });

  test(`${file}: input rules outline in var(--border-input)`, () => {
    for (const sel of INPUT_RULES) {
      const re = new RegExp(`\\n  ${sel.replace(/\./g, '\\.')} \\{([^}]*)\\}`, 'g');
      const bodies = [...css.matchAll(re)].map((m) => m[1]).filter((b) => /border:/.test(b));
      assert.ok(bodies.length > 0, `${sel} has a border rule`);
      for (const b of bodies) assert.match(b, /border: 1px solid var\(--border-input\)/, sel);
    }
  });

  test(`${file}: dark mode pins the old values of shared tokens and defines --border-input`, () => {
    const d = darkOf(css);
    for (const [name, hex] of Object.entries(DARK_PINS)) assert.equal(d[name], hex, `dark --${name}`);
    assert.match(block(css, ':root[data-theme="dark"],'), /--border-input:\s*var\(--dk-border-default\);/);
  });
}
