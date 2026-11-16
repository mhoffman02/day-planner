/**
 * @file easing.test.js
 * @description A8 easing: dialogs, late hub tabs and newly rendered task rows fade in (opacity only,
 * 150-200 ms tokens), disabled under prefers-reduced-motion. Both stylesheets must carry the rules.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SHEETS = ['src/styles.css', 'gas-app/Styles.html'];
const DURATION = /var\(--duration-(standard|slow)\)/;

/** Bodies of every rule whose selector text contains `selector`, joined. */
function ruleBody(css, selector) {
  const bodies = [];
  let at = css.indexOf(selector);
  while (at !== -1) {
    const open = css.indexOf('{', at);
    const close = css.indexOf('}', open);
    bodies.push(css.slice(open + 1, close));
    at = css.indexOf(selector, close);
  }
  return bodies.length ? bodies.join('\n') : null;
}

/** All reduced-motion blocks concatenated (nested braces handled by depth count). */
function reducedMotion(css) {
  let out = '';
  const marker = '@media (prefers-reduced-motion: reduce)';
  let i = css.indexOf(marker);
  while (i !== -1) {
    const open = css.indexOf('{', i);
    let depth = 1;
    let j = open + 1;
    while (depth && j < css.length) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    out += css.slice(open + 1, j - 1);
    i = css.indexOf(marker, j);
  }
  return out;
}

for (const file of SHEETS) {
  describe(`easing in ${file}`, () => {
    const css = read(file);
    const rm = reducedMotion(css);
    const targets = [
      ['dialog fade', 'dialog.modal-backdrop[open]'],
      ['daily row fade', 'tr[id^="daily-row-"]'],
      ['master row fade', 'tr[id^="master-row-"]'],
    ];
    for (const [name, sel] of targets) {
      it(`${name}: ${sel} animates opacity with a 150-200 ms token`, () => {
        const body = ruleBody(css, sel);
        assert.ok(body, `no rule for ${sel}`);
        assert.match(body, /animation:\s*fade-in\b/, 'uses the fade-in keyframes');
        assert.match(body, DURATION, 'uses a duration token');
      });
      it(`${name}: ${sel} is neutralized under reduced motion`, () => {
        assert.ok(rm.includes(sel.replace(/ \{$/, '')), `${sel} missing from reduced-motion block`);
      });
    }
    it('fade-in keyframes are opacity only', () => {
      const body = ruleBody(css, '@keyframes fade-in');
      const close = css.indexOf('\n  }', css.indexOf('@keyframes fade-in'));
      const block = css.slice(css.indexOf('@keyframes fade-in'), close);
      assert.ok(body, 'fade-in keyframes exist');
      assert.doesNotMatch(block, /transform|translate|scale/);
    });
    it('the fade-in class stays reduced-motion safe', () => {
      assert.match(rm, /\.fade-in\s*\{\s*animation:\s*none/);
    });
  });
}

describe('late hub tabs', () => {
  it('gas-app/Index.html: Triage and Prep tab buttons carry fade-in', () => {
    const html = read('gas-app/Index.html');
    for (const title of ['Gmail Triage Board', 'Meeting Prep and Carry-ins']) {
      const line = html.split('\n').find((l) => l.includes(`title="${title}"`));
      assert.ok(line, `${title} button found`);
      assert.match(line, /class="segment-btn fade-in"/);
    }
  });
});
