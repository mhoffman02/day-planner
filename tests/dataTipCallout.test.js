/**
 * @file dataTipCallout.test.js
 * @description CSS-only callout for icon controls (user 2026-11-18): a [data-tip] element shows its text in a bordered
 * bubble with a tail on hover and keyboard focus, no JavaScript. The appointment row icons opt in with data-tip and
 * drop title (the plain browser tooltip), keeping aria-label for screen readers. Checks both stylesheet copies and both
 * Index copies.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

for (const file of ['src/styles.css', 'gas-app/Styles.html']) {
  test(`${file}: [data-tip] draws a bubble and a tail from the attribute, on hover and focus-visible`, () => {
    const css = read(file);
    assert.match(css, /\[data-tip\]::after\s*\{[^}]*content:\s*attr\(data-tip\)/);
    assert.match(css, /\[data-tip\]::before\s*\{[^}]*content:\s*""/);
    assert.match(css, /\[data-tip\]:hover::after/);
    assert.match(css, /\[data-tip\]:focus-visible::after/);
  });

  test(`${file}: [data-tip-pos="top"] flips the bubble above the control`, () => {
    assert.match(read(file), /\[data-tip\]\[data-tip-pos="top"\]::after\s*\{[^}]*bottom:/);
  });

  test(`${file}: the callout is flat (4px radius, no pill) and uses no !important`, () => {
    const css = read(file);
    const block = css.slice(css.indexOf('[data-tip]::after'), css.indexOf('[data-tip]::after') + 600);
    assert.match(block, /border-radius:\s*4px/);
    assert.doesNotMatch(block, /!important/);
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
