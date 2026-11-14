/**
 * @file todayLinkNav.test.js
 * @description The Daily "Today" and Month "This Month" header links follow the Future "This Year" fix:
 * always rendered left of the previous chevron, visibility-hidden when already on today or this month,
 * so the date nav never shifts when the link appears. Runs against both client copies.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const LINKS = [
  { label: 'Today', jump: 'jumpToToday()', prev: 'navigateDay(-1)', cond: 'isOffToday()' },
  { label: 'This Month', jump: 'jumpToCurrentMonth()', prev: 'navigateMonth(-1)', cond: '!isCurrentCalendarMonth(selectedYear, selectedMonth)' },
];

for (const file of ['index.html', 'gas-app/Index.html']) {
  const html = read(file);
  for (const { label, jump, prev, cond } of LINKS) {
    test(`${file}: "${label}" sits left of the previous chevron and keeps its room when hidden`, () => {
      const prevAt = html.indexOf(`@click="${prev}"`);
      assert.ok(prevAt > -1, `${prev} chevron present`);
      const group = html.slice(html.lastIndexOf('class="date-controls-group"', prevAt), prevAt);
      const tag = group.match(new RegExp(`<button[^>]*class="today-link-btn"[^>]*@click="${jump.replace(/[()]/g, '\\$&')}"[^>]*>`));
      assert.ok(tag, `${label} link precedes the previous chevron in its group`);
      const negated = cond.startsWith('!') ? cond.slice(1) : `!${cond}`;
      assert.ok(tag[0].includes(`:class="{ 'is-placeholder': ${negated} }"`), `${label} placeholder class bound`);
      assert.ok(!html.includes(`<template x-if="${cond}">`), `${label} not mounted conditionally`);
    });
  }
}

for (const file of ['src/styles.css', 'gas-app/Styles.html']) {
  test(`${file}: a placeholder today link is invisible but keeps its width`, () => {
    assert.match(read(file), /\.today-link-btn\.is-placeholder\s*\{\s*visibility:\s*hidden;\s*\}/);
  });
}
