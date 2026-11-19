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

// Every hover tip in the app markup uses data-tip (user 2026-11-18): a bare title shows the browser's own tooltip, which
// is slower, unstyled and cannot be placed. These four files are the whole app markup; index.html carries copies of
// About and Tutorial.
const MARKUP_FILES = ['index.html', 'gas-app/Index.html', 'gas-app/About.html', 'gas-app/Tutorial.html'];
const OPEN_TAG = /<([a-zA-Z][\w-]*)((?:\s+[^\s"'>=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/g;

for (const file of MARKUP_FILES) {
  test(`${file}: no title or :title attribute is left, hover tips are data-tip`, () => {
    const left = [];
    for (const m of read(file).matchAll(OPEN_TAG)) {
      if (/\s(?::|x-bind:)?title\s*=/.test(m[2])) left.push(m[0].slice(0, 90));
    }
    assert.deepEqual(left, []);
  });

  test(`${file}: a button or link whose only content is an icon keeps an accessible name (aria-label)`, () => {
    const html = read(file);
    const nameless = [];
    for (const m of html.matchAll(OPEN_TAG)) {
      const [open, tag, attrs] = m;
      if (!/^(button|a)$/.test(tag) || !/\s:?data-tip\s*=/.test(attrs) || /\s:?aria-label\s*=/.test(attrs)) continue;
      const rest = html.slice(m.index + open.length);
      const inner = rest.slice(0, rest.indexOf(`</${tag}>`));
      const hasText = /x-text=|x-html=/.test(inner) ||
        inner.replace(/<span[^>]*material-symbols[^>]*>[^<]*<\/span>/g, '').replace(/<[^>]*>/g, '').trim() !== '';
      if (!hasText) nameless.push(open.slice(0, 90));
    }
    assert.deepEqual(nameless, []);
  });
}

for (const file of ['src/styles.css', 'gas-app/Styles.html']) {
  test(`${file}: a long tip wraps inside a capped width instead of running off the screen`, () => {
    const css = read(file);
    const rule = css.match(/\.data-tip-bubble\s*\{([^}]*)\}/)[1];
    assert.match(rule, /white-space:\s*normal/);
    assert.match(rule, /width:\s*max-content/);
    assert.match(rule, /max-width:\s*min\(/);
  });
}
