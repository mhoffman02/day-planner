/**
 * @file quietButtons.test.js
 * @description Quiet buttons: every utility button rests as a bare label or icon (transparent fill and border, like
 * the top-bar Search / Sync / View options) and shows chrome only on hover or keyboard focus. Primary actions,
 * selected states and alerts keep their fill. Cascade is judged by source order among identical selectors, so each
 * selector below must match the specificity of the rule it quiets.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const QUIET = [
  '.icon-nav-btn',
  '.today-jump-btn',
  '.month-picker-year-nav .icon-nav-btn',
  '[data-theme="dark"] .month-picker-year-nav .icon-nav-btn',
  '.day-picker-nav-btn',
  '[data-theme="dark"] .day-picker-nav-btn',
  '.day-picker-today-btn',
  '[data-theme="dark"] .day-picker-today-btn',
  '.master-task-due-btn',
  '[data-theme="dark"] .master-task-due-btn',
  '.view-options-theme-btn',
  '.priority-renumber-btn',
  '.btn-icon-subtle',
  '.btn-add-quiet',
  '[data-theme="dark"] .btn-add-quiet',
  '.future-item-add-bar .icon-nav-btn',
  '.future-item-actions .icon-nav-btn',
  '.master-tasks-add-bar .icon-nav-btn',
  '[data-theme="dark"] .future-item-add-bar .icon-nav-btn',
  '[data-theme="dark"] .future-item-actions .icon-nav-btn',
  '[data-theme="dark"] .master-tasks-add-bar .icon-nav-btn',
  '.btn-jump-day',
  '[data-theme="dark"] .btn-jump-day',
  '.btn-secondary',
  '[data-theme="dark"] .btn-secondary',
  '.install-actions-bar .btn-secondary',
  '.modal-card-install .btn-secondary',
  '[data-theme="dark"] .install-actions-bar .btn-secondary',
  '[data-theme="dark"] .modal-card-install .btn-secondary',
  '.forward-pick-btn.is-secondary',
  '[data-theme="dark"] .forward-pick-btn.is-secondary',
  '.btn-move-to',
  '.btn-jump-to',
  '[data-theme="dark"] .btn-jump-to',
  '.btn-delete-row',
  '[data-theme="dark"] .btn-delete-row',
  '.event-rsvp-btn',
  '.about-action-btn',
  '[data-theme="dark"] .about-action-btn',
  '.stt-fallback-btn',
  '[data-theme="dark"] .stt-fallback-btn',
  '.hub-action-btn',
  '.hub-action-btn.hub-action-quiet',
  '.hub-action-btn.hub-action-danger',
  '[data-theme="dark"] .hub-action-btn.hub-action-danger',
];

// Loud on purpose: primary actions, selected states, alerts, calendar event blocks.
const LOUD = [
  '.btn-primary',
  '.forward-pick-btn',
  '.btn-meet',
  '.auth-approve-btn',
  '.event-rsvp-btn[aria-pressed="true"]',
  '.about-action-btn.is-on',
  '.category-segment-btn.is-active',
  'button.event-pill',
];

/** Last background and border colour declared for an exact selector, in source order. */
function finalChrome(css, selector) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let bg = null;
  let border = null;
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    // Split the selector list on top-level commas only, not those inside :is(...)
    if (!m[1].split(/,(?![^()]*\))/).map((s) => s.trim()).includes(selector)) continue;
    for (const d of m[2].split(';')) {
      const [prop, ...rest] = d.split(':');
      const p = (prop || '').trim();
      const v = rest.join(':').replace('!important', '').trim();
      if (p === 'background' || p === 'background-color') bg = v;
      if (p === 'border-color') border = v;
      if (p === 'border') border = /none|^0/.test(v) ? 'transparent' : v.replace(/^\S+\s+\S+\s*/, '') || v;
    }
  }
  return { bg, border };
}

for (const file of ['src/styles.css', 'gas-app/Styles.html']) {
  test(`${file}: utility buttons rest with no fill and no border`, () => {
    const css = read(file);
    for (const sel of QUIET) {
      const { bg, border } = finalChrome(css, sel);
      assert.ok(bg === null || bg === 'transparent', `${sel} rests transparent, got background ${bg}`);
      assert.ok(border === null || border === 'transparent', `${sel} rests borderless, got border ${border}`);
    }
  });

  test(`${file}: quiet buttons show a border on hover and keyboard focus`, () => {
    const css = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = css.match(/:is\(([^{}]*)\):is\(:hover, :focus-visible\)\s*\{([^}]*)\}/);
    assert.ok(rule, 'one shared hover / focus rule');
    assert.match(rule[2], /border-color:\s*color-mix\(in srgb, currentColor/);
  });

  test(`${file}: primary actions, selected states and alerts keep their fill`, () => {
    const css = read(file);
    for (const sel of LOUD) {
      const { bg } = finalChrome(css, sel);
      assert.ok(bg && bg !== 'transparent', `${sel} keeps a fill, got ${bg}`);
    }
  });
}
