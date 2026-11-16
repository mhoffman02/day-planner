/**
 * @file mockPaletteDefault.test.js
 * @description User 2026-11-16: the local mock (index.html, npm start) opens in the Navy palette, the palette the
 * user runs on HOME. A saved choice still wins, and the GAS page (gas-app/Index.html) keeps teal as its default.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function bootstrapPalette(page, saved) {
  const html = read(page);
  const script = html.split('<script>').map((s) => s.split('</script>')[0]).find((s) => s.includes('data-palette'));
  assert.ok(script, `${page} has a palette bootstrap script`);
  const store = saved === undefined ? {} : { dayPlannerPalette: saved };
  const attrs = {};
  const sandbox = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
    document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, style: {} } },
    window: { matchMedia: () => ({ matches: false }) },
    console,
  };
  vm.runInNewContext(script, sandbox);
  return { palette: attrs['data-palette'], stored: store.dayPlannerPalette };
}

describe('mock palette default', () => {
  it('index.html opens in navy when nothing is saved, and stores it for the app', () => {
    assert.deepEqual(bootstrapPalette('index.html', undefined), { palette: 'navy', stored: 'navy' });
  });
  it('index.html keeps a saved teal choice', () => {
    assert.equal(bootstrapPalette('index.html', 'teal').palette, 'teal');
  });
  it('the GAS page still defaults to teal', () => {
    assert.equal(bootstrapPalette('gas-app/Index.html', undefined).palette, 'teal');
  });
});
