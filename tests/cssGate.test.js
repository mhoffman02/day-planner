import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCss, compare } from '../tools/check-css.js';

test('token definition may hold a literal, a consumer may not', () => {
  const c = checkCss(':root { --bg: #fcfbfa; }\n.a { color: #fff; background: var(--bg); }');
  assert.equal(c['magic-color'], 1);
});
test('!important, id selector, z-index literal, px font-size are counted', () => {
  const c = checkCss('#x { z-index: 10; font-size: 12px; color: var(--c) !important; }');
  assert.deepEqual([c['id-selector'], c['magic-z'], c['px-font'], c.important], [1, 1, 1, 1]);
});
test('z-index var() and rem font-size pass', () => {
  const c = checkCss('.a { z-index: var(--z-modal); font-size: 1rem; }');
  assert.equal(c['magic-z'] + c['px-font'], 0);
});
test('declarations inside @media are scanned', () => {
  assert.equal(checkCss('@media (min-width: 1px) { .a { color: rgb(1,2,3); } }')['magic-color'], 1);
});
test('outline none needs focus-visible; motion needs reduced-motion', () => {
  assert.equal(checkCss('.a { outline: none; }')['outline-none'], 1);
  assert.equal(checkCss('.a:focus-visible { outline: none; }')['outline-none'], 0);
  assert.equal(checkCss('.a { transition: all 1s; }')['no-reduced-motion'], 1);
  assert.equal(checkCss('.a { transition: all 1s; } @media (prefers-reduced-motion: reduce) { .a { transition: none; } }')['no-reduced-motion'], 0);
});
test('compare fails only when a count rises above baseline', () => {
  assert.equal(compare({ important: 3 }, { important: 3 }).length, 0);
  assert.equal(compare({ important: 4 }, { important: 3 }).length, 1);
});
