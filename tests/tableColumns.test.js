import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  TABLE_COL_MIN, TABLE_COL_MAX,
  clampColWidth, parseSavedTableCols, resizedColWidth, colEdgeAt, colResizePlan, colVarName
} from '../src/layoutPrefs.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('column width clamps to min..max and falls back to null on junk', () => {
  assert.equal(clampColWidth(5), TABLE_COL_MIN);
  assert.equal(clampColWidth(99999), TABLE_COL_MAX);
  assert.equal(clampColWidth(120.4), 120);
  assert.equal(clampColWidth('x'), null);
});

test('resized width follows the pointer and corrects for UI zoom', () => {
  assert.equal(resizedColWidth(100, 30, 100), 130);
  assert.equal(resizedColWidth(100, 25, 125), 120);
  assert.equal(resizedColWidth(100, -500, 100), TABLE_COL_MIN);
});

test('edge detection picks the header boundary within the slop, else -1', () => {
  const rights = [50, 100, 400];
  assert.equal(colEdgeAt(rights, 99, 4), 1);
  assert.equal(colEdgeAt(rights, 103, 4), 1);
  assert.equal(colEdgeAt(rights, 400, 4), 2);
  assert.equal(colEdgeAt(rights, 200, 4), -1);
});

test('last column edge sits on the table border, so its grab zone reaches 3x slop inward and none outward', () => {
  const rights = [50, 100, 400];
  assert.equal(colEdgeAt(rights, 390, 4), 2);
  assert.equal(colEdgeAt(rights, 388, 4), 2);
  assert.equal(colEdgeAt(rights, 387, 4), -1);
  assert.equal(colEdgeAt(rights, 403, 4), -1);
});

test('plan: a fixed column resizes itself, a flex column resizes its right neighbour inversely', () => {
  assert.deepEqual(colResizePlan(0, 2, 6), { col: 0, sign: 1 });
  assert.deepEqual(colResizePlan(2, 2, 6), { col: 3, sign: -1 });
  assert.equal(colResizePlan(5, 5, 6), null);
});

test('CSS variable names are 1-based per table', () => {
  assert.equal(colVarName('master', 0), '--tc-master-1');
  assert.equal(colVarName('hub', 4), '--tc-hub-5');
});

test('saved table columns keep valid entries and drop junk, loudly', () => {
  const errors = [];
  const orig = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  try {
    assert.deepEqual(parseSavedTableCols('{"master":{"0":60,"4":150}}'), { master: { 0: 60, 4: 150 } });
    assert.deepEqual(parseSavedTableCols(null), {});
    assert.deepEqual(parseSavedTableCols('not json'), {});
    assert.deepEqual(parseSavedTableCols('{"master":{"0":5,"1":"a"},"bogus":{"0":80}}'), {});
    assert.ok(errors.length >= 2);
  } finally {
    console.error = orig;
  }
});

test('gas-app/Script.html mirrors the helpers and the app wiring', () => {
  const html = read('gas-app/Script.html');
  assert.match(html, /const TABLE_COL_MIN = /);
  for (const fn of ['clampColWidth', 'parseSavedTableCols', 'resizedColWidth', 'colEdgeAt', 'colResizePlan', 'colVarName']) {
    assert.match(html, new RegExp(`function ${fn}\\(`), `${fn} missing from Script.html`);
  }
  for (const src of ['src/app.js', 'gas-app/Script.html']) {
    const s = read(src);
    for (const m of ['initTableColumns()', 'resetTableColumns()', 'resetAllWidths()', 'autoFitTableColumn(']) {
      assert.ok(s.includes(m), `${src}: ${m} missing`);
    }
    assert.match(s, /dayPlannerTableColumns/, `${src}: storage key`);
  }
});

test('four tables opt in with an id and a flex column, in both HTML copies', () => {
  for (const page of ['index.html', 'gas-app/Index.html']) {
    const html = read(page);
    for (const [id, flex] of [['daily', 3], ['master', 3], ['index', 3], ['hub', 2]]) {
      assert.match(html, new RegExp(`data-col-table="${id}" data-col-flex="${flex}"`), `${page}: ${id}`);
    }
  }
});

test('View options carries one Widths reset row, in both HTML copies', () => {
  for (const page of ['index.html', 'gas-app/Index.html']) {
    const html = read(page);
    assert.match(html, /@click="resetAllWidths\(\)"/, `${page}: reset button`);
    assert.match(html, /View options \(size, theme, widths\)/, `${page}: button title`);
  }
});

test('Master and Index default widths match their columns (Due 120, Action 260, Date 150)', () => {
  for (const css of ['src/styles.css', 'gas-app/Styles.html']) {
    const s = read(css);
    assert.match(s, /\.master-tasks-table th:nth-child\(5\)[^{]*\{\s*width: var\(--tc-master-5, 120px\)/, `${css}: master due`);
    assert.match(s, /\.master-tasks-table th:nth-child\(6\)[^{]*\{\s*width: var\(--tc-master-6, 260px\)/, `${css}: master action`);
    assert.match(s, /\.monthly-index-table th:nth-child\(1\)[^{]*\{\s*width: var\(--tc-index-1, 150px\)/, `${css}: index date`);
    assert.match(s, /\.hub-table-wrap \.hub-table \{\s*table-layout: fixed/, `${css}: hub fixed layout`);
  }
});
