/**
 * @file searchMatchMode.test.js
 * @description Search that finds things in a long task list. One matcher (All words / Any word / Exact phrase)
 * shared by universal search and the Master Tasks filter text, a debounced Master filter box, and a search
 * result that deep links to its task row. Runs against both client copies.
 */
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bothClients, makeVm, settle } from './helpers/plannerHarness.js';
import * as engine from '../src/searchEngine.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const clients = await bothClients({ exportNames: ['matchesSearchQuery', 'executeUniversalSearch'] });
const engines = [
  { label: 'src/searchEngine.js', matchesSearchQuery: engine.matchesSearchQuery, executeUniversalSearch: engine.executeUniversalSearch },
  { label: 'gas-app/Script.html', matchesSearchQuery: clients[1].scope.matchesSearchQuery, executeUniversalSearch: clients[1].scope.executeUniversalSearch }
];

for (const e of engines) {
  describe(`search match modes [${e.label}]`, () => {
    it('All words: every word, any order, across fields, any case', () => {
      assert.equal(e.matchesSearchQuery(['Renew USAi license', 'ask budget office'], 'budget usai', 'all'), true);
      assert.equal(e.matchesSearchQuery(['Renew USAi license'], 'budget usai', 'all'), false);
    });
    it('Any word: at least one word', () => {
      assert.equal(e.matchesSearchQuery(['Renew USAi license'], 'budget usai', 'any'), true);
      assert.equal(e.matchesSearchQuery(['Renew license'], 'budget usai', 'any'), false);
    });
    it('Exact phrase: the words together, in order, within one field', () => {
      assert.equal(e.matchesSearchQuery(['Renew USAi license'], 'usai license', 'exact'), true);
      assert.equal(e.matchesSearchQuery(['License for USAi'], 'usai license', 'exact'), false);
      assert.equal(e.matchesSearchQuery(['Renew USAi', 'license'], 'usai license', 'exact'), false);
    });
    it('an empty query matches everything (an empty filter box hides nothing)', () => {
      assert.equal(e.matchesSearchQuery(['x'], '   ', 'all'), true);
    });
    it('an unknown mode fails loud', () => {
      assert.throws(() => e.matchesSearchQuery(['x'], 'x', 'fuzzy'), /match mode/);
    });
    it('universal search defaults to All words and honors the mode', () => {
      const store = { masterTasks: [{ id: 'm1', title: 'Renew USAi license', notes: 'budget office' }] };
      assert.equal(e.executeUniversalSearch('license usai', store).tasks.length, 1, 'default All words');
      assert.equal(e.executeUniversalSearch('license usai', store, 'exact').tasks.length, 0);
      assert.equal(e.executeUniversalSearch('license zebra', store, 'any').tasks.length, 1);
      assert.equal(e.executeUniversalSearch('license zebra', store, 'all').tasks.length, 0);
    });
  });
}

const DATE = '2031-03-12';
const many = Array.from({ length: 60 }, (_, i) => ({ id: `m${i}`, title: `[B${i}] Routine item ${i}`, status: '•' }));
const target = { id: 'mUSAi', title: '[A1] Renew USAi license', notes: 'budget office', status: '○', dueDate: '' };

for (const c of clients) {
  describe(`Master Tasks filter text and deep link [${c.label}]`, () => {
    const vm = (over = {}) => makeVm(c.factory, { selectedDate: DATE, dailyTasks: [], calendarEvents: [], masterTasks: [...many, { ...target }], bridge: {}, ...over });

    it('the filter text narrows the list with the shared match mode', () => {
      const v = vm();
      v.masterTaskSearch = 'usai renew';
      assert.deepEqual(v.filteredMasterTasks.map((t) => t.id), ['mUSAi']);
      v.searchMatchMode = 'exact';
      assert.equal(v.filteredMasterTasks.length, 0);
      v.masterTaskSearch = 'budget';
      assert.deepEqual(v.filteredMasterTasks.map((t) => t.id), ['mUSAi'], 'notes count');
    });

    it('typing is debounced: the box updates at once, the list after a pause', async () => {
      const v = vm();
      v.onMasterSearchInput('usai');
      assert.equal(v.masterTaskSearchInput, 'usai');
      assert.equal(v.masterTaskSearch, '', 'not applied on every keystroke');
      await settle();
      assert.equal(v.masterTaskSearch, 'usai');
    });

    it('says when status or date filters hide matches, and Show all reveals them', () => {
      const v = vm({ masterTaskStatusFilter: ['•'] });
      v.masterTaskSearch = 'usai';
      assert.equal(v.filteredMasterTasks.length, 0);
      assert.equal(v.masterSearchHiddenCount, 1);
      v.showAllMasterFilters();
      assert.equal(v.masterSearchHiddenCount, 0);
      assert.deepEqual(v.filteredMasterTasks.map((t) => t.id), ['mUSAi']);
    });

    it('clearing the filter empties the box and draws the long list in batches again', () => {
      const v = vm();
      v.masterTaskSearchInput = 'usai';
      v.masterTaskSearch = 'usai';
      v.masterRenderLimit = Infinity;
      v.clearMasterSearch();
      assert.equal(v.masterTaskSearchInput, '');
      assert.equal(v.masterTaskSearch, '');
      assert.ok(v.masterRenderLimit < 60, 'not every row in one frame');
    });

    it('a Master search result opens Master Tasks filtered to the query, un-hides it, and marks the row', () => {
      const v = vm({ masterTaskStatusFilter: ['•'], masterTaskDateFilter: 'future' });
      v.prepareTaskReveal({ type: 'task', targetView: 'master-tasks', item: target }, 'USAi');
      assert.equal(v.masterTaskSearch, 'USAi');
      assert.equal(v.masterTaskSearchInput, 'USAi');
      assert.equal(v.searchHitTaskId, 'mUSAi');
      assert.deepEqual(v.filteredMasterTasks.map((t) => t.id), ['mUSAi'], 'visible and inside the first batch');
      assert.equal(v.searchHitRowId(), 'master-row-mUSAi');
    });

    it('a Daily task result marks its row on that day without touching the Master filter', () => {
      const v = vm();
      v.prepareTaskReveal({ type: 'task', targetView: 'daily', date: DATE, item: { id: 't9', title: 'Call USAi', dueDate: DATE } }, 'USAi');
      assert.equal(v.masterTaskSearch, '');
      assert.equal(v.searchHitTaskId, 't9');
      assert.equal(v.searchHitRowId(), 'daily-row-t9');
    });
  });
}

test('both Index copies: Master filter box, shared mode control, and view-prefixed task row ids', () => {
  for (const page of ['index.html', 'gas-app/Index.html']) {
    const html = read(page);
    const master = (html.match(/aria-label="Master Tasks"[\s\S]*?<\/section>/) || [''])[0];
    assert.match(master, /<input[^>]*type="search"[^>]*:value="masterTaskSearchInput"[^>]*@input="onMasterSearchInput\(\$event\.target\.value\)"/, `${page}: filter box`);
    assert.match(master, /@click="clearMasterSearch\(\)"/, `${page}: clear button`);
    assert.match(master, /x-model="searchMatchMode"/, `${page}: Master match mode`);
    assert.match(master, /:id="'master-row-' \+ mTask\.id"/, `${page}: Master row id`);
    assert.match(master, /'search-hit': searchHitTaskId === mTask\.id/, `${page}: Master row highlight`);
    assert.match(master, /@click="showAllMasterFilters\(\)"/, `${page}: show all when filters hide matches`);
    assert.match(html, /:id="'daily-row-' \+ task\.id"/, `${page}: Daily row id`);
    assert.match(html, /'search-hit': searchHitTaskId === task\.id/, `${page}: Daily row highlight`);
    const modal = (html.match(/class="search-input-field"[\s\S]*?<\/dialog>/) || [''])[0];
    assert.match(modal, /x-model="searchMatchMode"/, `${page}: universal search match mode`);
  }
});
