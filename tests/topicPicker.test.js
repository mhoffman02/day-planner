import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mergeTopicOptions, topicDropdownItems, cardChipOptions, noteFilterCategories, TOPIC_LIST_LIMIT, TOPIC_MATCH_LIMIT } from '../src/topicPicker.js';

test('topic options list Task categories first, then used topics, deduped caselessly', () => {
  assert.deepEqual(
    mergeTopicOptions(['Work', 'General'], ['general', 'Sprint', ' ', 'Work', null]),
    ['Work', 'General', 'Sprint']
  );
});

test('dropdown shows every option while the value is still the one it had at focus', () => {
  const opts = ['General', 'Work', 'Sprint'];
  assert.deepEqual(topicDropdownItems(opts, 'General', 'General'), opts);
  assert.deepEqual(topicDropdownItems(opts, '', 'General'), opts);
});

test('dropdown filters once the user types something new', () => {
  assert.deepEqual(topicDropdownItems(['General', 'Work', 'Sprint'], 'r', 'General'), ['General', 'Work', 'Sprint']);
  assert.deepEqual(topicDropdownItems(['General', 'Work', 'Sprint'], 'spr', 'General'), ['Sprint']);
});

test('chip row keeps the card own categories visible even when not shared', () => {
  const { visible, overflow } = cardChipOptions(['Work', 'Health', 'Personal', 'Meeting', 'Decision', 'Projects', 'Financial'], ['Project'], 5);
  assert.deepEqual(visible, ['Decision', 'Health', 'Meeting', 'Personal', 'Project', 'Work']);
  assert.deepEqual(overflow, ['Financial', 'Projects']);
});

test('chip row order is alphabetical so recency changes never reorder visible chips', () => {
  const a = cardChipOptions(['Work', 'Personal'], [], 5).visible;
  const b = cardChipOptions(['Personal', 'Work'], [], 5).visible;
  assert.deepEqual(a, b);
});

test('note filter offers shared categories plus any found on loaded cards', () => {
  assert.deepEqual(
    noteFilterCategories(['Work'], [{ categories: ['Project'] }, { category: 'Meeting, Work' }, {}]),
    ['Meeting', 'Project', 'Work']
  );
});

test('unfiltered dropdown shows at most 20 rows; typing searches deeper history, up to 50 matches', () => {
  assert.equal(TOPIC_LIST_LIMIT, 20);
  assert.equal(TOPIC_MATCH_LIMIT, 50);
  const opts = Array.from({ length: 100 }, (_, i) => 'Topic ' + i);
  assert.equal(topicDropdownItems(opts, '', '').length, 20);
  assert.deepEqual(topicDropdownItems(opts, 'topic 99', ''), ['Topic 99']);
  assert.equal(topicDropdownItems(opts, 'topic', '').length, 50);
});

test('topic options merge any number of sources in order', () => {
  assert.deepEqual(mergeTopicOptions(['Work'], ['Sprint'], ['Old Tag', 'work']), ['Work', 'Sprint', 'Old Tag']);
});

test('Notes Topic input uses a native suggestion list like Tasks Category, fed by the shared topics', () => {
  for (const file of ['gas-app/Index.html', 'index.html']) {
    const html = fs.readFileSync(file, 'utf8');
    const input = html.match(/<input type="text"\s+x-model="card\.indexTopic"[^>]*>/);
    assert.ok(input, `${file}: Topic input not found`);
    assert.match(input[0], /list="topic-suggestions"/, `${file}: Topic not wired to the native topic list`);
    assert.match(html, /<datalist id="topic-suggestions">\s*<template x-for="t in topicSuggestions"/, `${file}: topic datalist missing`);
    assert.doesNotMatch(html, /class="topic-lru-dropdown"/, `${file}: custom Topic dropdown still present`);
    assert.doesNotMatch(html, /x-for="cat in noteCategoryOptions"/, `${file}: chip row still hard-coded`);
  }
});
