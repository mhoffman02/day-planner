/**
 * @file dataTipCallout.test.js
 * @description Callout for icon controls (user 2026-11-18): a [data-tip] element shows its text in a bordered bubble with
 * a tail on hover and keyboard focus. The bubble is one fixed-position element on the body, placed by src/dataTip.js, so
 * a scrolling list or a scrollbar cannot clip it (the first CSS-only version was cut off). The appointment row icons opt
 * in with data-tip and drop title (the plain browser tooltip), keeping aria-label for screen readers. Checks both
 * stylesheet copies, both Index copies and the wiring in both client copies.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

for (const file of ['src/styles.css', 'gas-app/Styles.html']) {
  test(`${file}: the bubble is fixed to the viewport on the top layer, hidden until shown`, () => {
    const css = read(file);
    const rule = css.match(/\.data-tip-bubble\s*\{([^}]*)\}/)[1];
    assert.match(rule, /position:\s*fixed/);
    assert.match(rule, /z-index:\s*var\(--z-10000\)/);
    assert.match(rule, /pointer-events:\s*none/);
    assert.match(rule, /opacity:\s*0/);
    assert.match(css, /\.data-tip-bubble\.is-shown\s*\{[^}]*opacity:\s*1/);
  });

  test(`${file}: the tail points back at the control from either side, at the offset JS sets`, () => {
    const css = read(file);
    assert.match(css, /\.data-tip-bubble::before\s*\{[^}]*left:\s*var\(--tip-tail-x/);
    assert.match(css, /\.data-tip-bubble\[data-side="bottom"\]::before/);
    assert.match(css, /\.data-tip-bubble\[data-side="top"\]::before/);
  });

  test(`${file}: the callout is flat (4px radius, no pill), uses no !important, and the old pseudo-element version is gone`, () => {
    const css = read(file);
    const block = css.slice(css.indexOf('.data-tip-bubble {'), css.indexOf('.data-tip-bubble.is-shown'));
    assert.match(block, /border-radius:\s*4px/);
    assert.doesNotMatch(block, /!important/);
    assert.doesNotMatch(css, /\[data-tip\]/);
  });

  test(`${file}: reduced motion turns the fade off`, () => {
    assert.match(read(file), /prefers-reduced-motion: reduce\)\s*\{\s*\.data-tip-bubble\.is-shown\s*\{\s*transition:\s*none/);
  });
}

for (const file of ['index.html', 'gas-app/Index.html']) {
  test(`${file}: the appointment row icons use data-tip instead of title`, () => {
    const html = read(file);
    assert.match(html, /<a [^>]*:href="emailGuestsUrl\(evt\)"[^>]*data-tip="Email attendees"[^>]*aria-label="Email attendees"/);
    assert.match(html, /<a [^>]*:href="eventGCalLink\(evt\)"[^>]*data-tip="Open in gCal: Edit, chat\.\.\."[^>]*aria-label="Open in Google Calendar"/);
    assert.doesNotMatch(html, /<a [^>]*appt-guest-action[^>]*\stitle=/);
  });
}

for (const file of ['src/app.js', 'gas-app/Script.html']) {
  test(`${file}: init wires the data-tip callout once`, () => {
    const code = read(file);
    assert.equal((code.match(/initDataTips\(document, window\)/g) || []).length, 1);
  });
}

test('gas-app/Script.html carries the same placement and wiring code as src/dataTip.js', () => {
  const script = read('gas-app/Script.html');
  assert.match(script, /function dataTipPlacement\(/);
  assert.match(script, /function initDataTips\(/);
});
