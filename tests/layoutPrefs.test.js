import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  READING_WIDTH_DEFAULT, READING_WIDTH_MIN, READING_WIDTH_MAX,
  clampReadingWidth, parseSavedReadingWidth, resizedReadingWidth
} from '../src/layoutPrefs.js';

test('default is the old 960px About cap', () => {
  assert.equal(READING_WIDTH_DEFAULT, 960);
});
test('clamp keeps width inside min..max and falls back on junk', () => {
  assert.equal(clampReadingWidth(100), READING_WIDTH_MIN);
  assert.equal(clampReadingWidth(99999), READING_WIDTH_MAX);
  assert.equal(clampReadingWidth(700.4), 700);
  assert.equal(clampReadingWidth('abc'), READING_WIDTH_DEFAULT);
});
test('saved width parses only a number inside the range', () => {
  assert.equal(parseSavedReadingWidth('1200'), 1200);
  assert.equal(parseSavedReadingWidth(null), null);
  assert.equal(parseSavedReadingWidth(''), null);
  assert.equal(parseSavedReadingWidth('10'), null);
  assert.equal(parseSavedReadingWidth('NaN'), null);
});
test('page is centered, so each dragged px moves both edges', () => {
  assert.equal(resizedReadingWidth(960, 50, 'right', 100), 1060);
  assert.equal(resizedReadingWidth(960, -50, 'right', 100), 860);
  assert.equal(resizedReadingWidth(960, 50, 'left', 100), 860);
  assert.equal(resizedReadingWidth(960, -50, 'left', 100), 1060);
});
test('drag distance is corrected for the UI zoom percent', () => {
  assert.equal(resizedReadingWidth(960, 100, 'right', 125), 1120);
});
test('drag result is clamped', () => {
  assert.equal(resizedReadingWidth(960, -2000, 'right', 100), READING_WIDTH_MIN);
});
test('gas-app/Script.html carries the same constants and functions', () => {
  const html = fs.readFileSync(new URL('../gas-app/Script.html', import.meta.url), 'utf8');
  assert.match(html, /const READING_WIDTH_DEFAULT = 960;/);
  for (const fn of ['clampReadingWidth', 'parseSavedReadingWidth', 'resizedReadingWidth']) {
    assert.match(html, new RegExp(`function ${fn}\\(`));
  }
});
test('About article is sized by --reading-w, not a fixed cap', () => {
  const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /article\.about-container \{[^}]*max-width:\s*var\(--reading-w, 960px\)/);
});
