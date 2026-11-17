/**
 * @file navyPalette.test.js
 * @description User 2026-11-15: a Navy palette (the Franklin Monticello slate blue; light and dark) set from
 * the View options popover, no layout change; Navy light draws section heads dark navy with cream type;
 * and the day calendar opens on hover in place of a static month block.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PALETTES, parseSavedPalette, dayPickerClickAction } from '../src/layoutPrefs.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('parseSavedPalette', () => {
  it('lists teal first (the default) and navy', () => {
    assert.deepEqual(PALETTES, ['teal', 'navy']);
  });
  it('keeps a known palette', () => {
    assert.equal(parseSavedPalette('navy'), 'navy');
    assert.equal(parseSavedPalette('teal'), 'teal');
  });
  it('carries the earlier saved name monticello over to navy', () => {
    assert.equal(parseSavedPalette('monticello'), 'navy');
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

function rule(css, selector) {
  const m = css.match(new RegExp(`\\n\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`));
  assert.ok(m, `missing rule ${selector}`);
  return m[1];
}

// OKLCH chroma and hue of a hex color, to find green-tinted tokens however faint.
function chromaHue(hex) {
  const x = hex.length === 4 ? hex.slice(1).split('').map((c) => c + c).join('') : hex.slice(1, 7);
  const n = parseInt(x, 16);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => lin(v / 255));
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}

function luminance(hex) {
  const n = parseInt(hex.slice(1, 7), 16);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => lin(v / 255));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SEMANTIC = /success|status-complete|note-color|priority|decision|danger|info|warning|attention|tab-gold|snack/;

for (const file of ['src/styles.css', 'gas-app/Styles.html']) {
  describe(`${file}: Navy palette blocks`, () => {
    const css = read(file);
    const all = block(css, ':root[data-palette="navy"]');
    const dark = block(css, ':root[data-theme="dark"][data-palette="navy"]');
    const lightSel = ':root[data-theme="light"][data-palette="navy"]';
    const light = css.includes(`${lightSel} {`) ? block(css, lightSel) : '';
    it('recolors the accent and binder tokens in both modes', () => {
      for (const b of [all, dark]) assert.match(b, /--binder-teal: #[0-9a-f]{6};/);
      assert.match(all, /--accent: #[0-9a-f]{6};/);
    });
    it('leaves semantic colors alone (success, priorities, decisions, green notes)', () => {
      for (const b of [all, dark, light]) {
        assert.doesNotMatch(b, /--(success|dk-success|status-complete|priority-|decision|note-color-green)/);
      }
    });
    it('pins teal notes to teal so they do not turn into blue notes', () => {
      assert.match(all, /--note-color-teal: #2d6a5a;/);
      assert.match(dark, /--note-color-teal: #5cb89e;/);
    });
    // Guard: the first Navy pass skipped near-grey green tints (chroma under 0.012), so light headers stayed green.
    it('overrides every green-tinted light token, however faint', () => {
      const base = block(css, ':root,\n  :root[data-theme="light"],\n  [data-theme="light"]');
      const missed = [];
      for (const m of base.matchAll(/^\s*(--[\w-]+):\s*(#[0-9a-fA-F]{3,6});/gm)) {
        const [C, H] = chromaHue(m[2]);
        if (SEMANTIC.test(m[1]) || C <= 0.003 || H < 120 || H > 215) continue;
        if (!all.includes(`${m[1]}:`) && !light.includes(`${m[1]}:`)) missed.push(m[1]);
      }
      assert.deepEqual(missed, []);
    });
    it('gives Navy light slate navy section heads with cream type, and nothing else', () => {
      assert.match(light, /--head-bg: #3b5067;/);
      assert.match(light, /--head-ink: var\(--bg-parchment\);/);
      assert.doesNotMatch(dark, /--head-/);
      assert.doesNotMatch(all, /--head-/);
    });
    it('section heads read the head tokens with the old look as fallback', () => {
      assert.match(rule(css, 'table.task-table th'), /background: var\(--head-bg, var\(--bg-accent-subtle\)\);/);
      assert.match(rule(css, '.note-card-header'), /background: var\(--head-bg, var\(--bg-accent-subtle\)\);/);
      assert.match(rule(css, 'time.schedule-time'), /background: var\(--head-bg, var\(--bg-subtle-2\)\);/);
    });
    // User 2026-11-15: #19293a heads read too dark, and the pale quote header was the wrong blue.
    it('Navy light heads are lighter than the binder navy, cream type still reads at 7:1', () => {
      const bg = light.match(/--head-bg: (#[0-9a-f]{6});/)[1];
      const deep = all.match(/--bg-binder-deep: (#[0-9a-f]{6});/)[1];
      assert.ok(luminance(bg) > luminance(deep), `${bg} not lighter than ${deep}`);
      assert.ok(contrast('#fcfbfa', bg) >= 7, `cream on ${bg}: ${contrast('#fcfbfa', bg).toFixed(2)}`);
      assert.match(light, /--head-ink-muted: color-mix\(in srgb, var\(--bg-parchment\) 72%, var\(--head-bg\)\);/);
    });
    // User 2026-11-15: Navy light cards read too white; move them a third of the way from the 15% mix
    // (#fdfcfb) toward the Manila card #f2ede3. In-card fills shift by the same step so zebra rows still show.
    it('Navy light cards are creamier, in-card fills keep their step, navy text stays AA', () => {
      assert.match(light, /--bg-card: #fbfaf8;/);
      assert.match(light, /--bg-parchment: #f4efe6;/);
      assert.match(light, /--bg-parchment-fixed: #f4efe6;/);
      for (const m of all.matchAll(/--(text-(?:default|primary|muted|muted-fixed|muted-2|muted-3|muted-4)): (#[0-9a-f]{6});/g)) {
        assert.ok(contrast(m[2], '#f4efe6') >= 4.5, `--${m[1]} ${m[2]} on in-card fill`);
      }
    });
    // User 2026-11-16, from the Navy Light Tuner artifact: lighter top bar and heads, more Manila page, paler cards.
    it('Navy light top bar is the tuned slate', () => {
      assert.match(light, /--bg-binder: #2e3c4c;/);
    });
    it('the quote header shares the section head band and ink', () => {
      assert.match(rule(css, '.quote-card-header'), /background: var\(--head-bg, var\(--binder-teal-light\)\);/);
      assert.match(rule(css, '.quote-card-title'), /color: var\(--head-ink, var\(--heading-color\)\);/);
      assert.match(css, /\.quote-card-header \.card-twistie-btn/);
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
    it('offers Teal and Navy in View options', () => {
      assert.ok(html.includes(`@click="setPalette('teal')"`));
      assert.ok(html.includes(`@click="setPalette('navy')"`));
      assert.ok(html.includes('>Navy</button>'));
    });
    it('opens the day calendar on hover and keeps click-outside closing', () => {
      assert.match(html, /class="date-picker-wrap" @click\.outside="closeDayPicker\(\)" @mouseenter="hoverDayPicker\(true\)" @mouseleave="hoverDayPicker\(false\)"/);
    });
  });
}
