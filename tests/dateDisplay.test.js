import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { splitDateDisplay } from '../src/dateDisplay.js';

test('header date splits into weekday and date, local calendar day', () => {
  assert.deepEqual(splitDateDisplay('2026-11-14'), { weekday: 'Sat', date: 'Nov 14, 2026' });
  assert.deepEqual(splitDateDisplay('2026-03-30'), { weekday: 'Mon', date: 'Mar 30, 2026' });
});

test('bad input shows as-is with no weekday', () => {
  assert.deepEqual(splitDateDisplay(''), { weekday: '', date: '' });
  assert.deepEqual(splitDateDisplay('nope'), { weekday: '', date: 'nope' });
});

test('header date button renders weekday and date as separate emphasized parts', () => {
  for (const file of ['gas-app/Index.html', 'index.html']) {
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /class="date-weekday" x-text="splitDateDisplay\(selectedDate\)\.weekday"/, `${file}: weekday span missing`);
    assert.match(html, /class="date-main" x-text="splitDateDisplay\(selectedDate\)\.date"/, `${file}: date span missing`);
  }
});
