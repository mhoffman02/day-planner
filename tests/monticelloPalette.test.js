/**
 * @file monticelloPalette.test.js
 * @description User 2026-11-15: a Monticello blue palette (light and dark) set from the View options popover,
 * no layout change; and the day calendar opens on hover in place of a static month block.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PALETTES, parseSavedPalette, dayPickerClickAction } from '../src/layoutPrefs.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('parseSavedPalette', () => {
  it('lists teal first (the default) and monticello', () => {
    assert.deepEqual(PALETTES, ['teal', 'monticello']);
  });
  it('keeps a known palette', () => {
    assert.equal(parseSavedPalette('monticello'), 'monticello');
    assert.equal(parseSavedPalette('teal'), 'teal');
  });
  it('falls back to teal when nothing or an unknown value is saved', () => {
    assert.equal(parseSavedPalette(null), 'teal');
    assert.equal(parseSavedPalette(''), 'teal');
    assert.equal(parseSavedPalette('purple'), 'teal');
  });
});

describe('dayPickerClickAction', () => {
  it('opens a closed picker', () => assert.equal(dayPickerClickAction(false, false), 'open'));
  it('pins a picker that hover opened, so the click does not close it under the pointer', () => {
    assert.equal(dayPickerClickAction(true, true), 'pin');
  });
  it('closes a picker that a click opened', () => assert.equal(dayPickerClickAction(true, false), 'close'));
});

function block(css, selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing ${selector} block`);
  return css.slice(start, css.indexOf('}', start));
}

for (const file of ['src/styles.css', 'gas-app/Styles.html']) {
  describe(`${file}: Monticello palette blocks`, () => {
    const css = read(file);
    const light = block(css, ':root[data-palette="monticello"]');
    const dark = block(css, ':root[data-theme="dark"][data-palette="monticello"]');
    it('recolors the accent and binder tokens in both modes', () => {
      for (const b of [light, dark]) assert.match(b, /--binder-teal: #[0-9a-f]{6};/);
      assert.match(light, /--accent: #[0-9a-f]{6};/);
    });
    it('leaves semantic colors alone (success, priorities, decisions, green notes)', () => {
      for (const b of [light, dark]) {
        assert.doesNotMatch(b, /--(success|dk-success|status-complete|priority-|decision|note-color-green)/);
      }
    });
    it('pins teal notes to teal so they do not turn into blue notes', () => {
      assert.match(light, /--note-color-teal: #2d6a5a;/);
      assert.match(dark, /--note-color-teal: #5cb89e;/);
    });
  });
}

for (const file of ['gas-app/Index.html', 'index.html']) {
  describe(`${file}: palette toggle and hover calendar`, () => {
    const html = read(file);
    it('applies the saved palette before first paint', () => {
      assert.match(html, /localStorage\.getItem\('dayPlannerPalette'\)/);
      assert.match(html, /setAttribute\('data-palette'/);
    });
    it('offers Teal and Monticello in View options', () => {
      assert.ok(html.includes(`@click="setPalette('teal')"`));
      assert.ok(html.includes(`@click="setPalette('monticello')"`));
    });
    it('opens the day calendar on hover and keeps click-outside closing', () => {
      assert.match(html, /class="date-picker-wrap" @click\.outside="closeDayPicker\(\)" @mouseenter="hoverDayPicker\(true\)" @mouseleave="hoverDayPicker\(false\)"/);
    });
  });
}
