/**
 * @file hubLabelsFilters.test.js
 * @description User 2026-10-16: (1) a setup script that creates the 🎯/ Gmail labels; (2) a script that reads the
 * user's labels, filters and labelled threads and recommends filters. Real HubController + GmailRepository +
 * Config.gs on the Gmail and Sheets fakes. Filters only ever add one label, and only for ticked rows.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread } from './helpers/gasFakesHub.js';

const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));
const EIGHT = ['🎯/Task', '🎯/Task-Today', '🎯/Waiting', '🎯/Meeting', '🎯/Meeting/NCMMS-Core', '🎯/Meeting/NCMMS-Daily', '🎯/Read', '🎯/Review'];
const created = (ctx) => ctx.__hub.gmail.calls.filter((c) => c.startsWith('labels.create:')).map((c) => c.slice('labels.create:'.length));

test('label setup creates the 🎯 parent first, then all eight labels', () => {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true } });
  const r = call(ctx, 'hubSetupLabels');
  assert.equal(r.ok, true, JSON.stringify(r));
  const names = created(ctx);
  assert.equal(names[0], '🎯');
  assert.ok(names.indexOf('🎯/Meeting') < names.indexOf('🎯/Meeting/NCMMS-Core'), 'Meeting parent before its children');
  for (const n of EIGHT) assert.ok(names.includes(n), n);
  assert.equal(names.length, 9);
});

test('label setup is idempotent and never touches labels that exist', () => {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true } });
  ['🎯', '🎯/Task', '🎯/Read'].forEach((n) => ctx.__hub.gmail.labelId(n));
  const r = call(ctx, 'hubSetupLabels');
  assert.equal(created(ctx).length, 6);
  assert.deepEqual(r.existing.slice().sort(), ['🎯', '🎯/Read', '🎯/Task'].sort());
  const again = call(ctx, 'hubSetupLabels');
  assert.equal(again.created.length, 0);
  assert.equal(again.message, 'All Day Planner Gmail labels already exist');
});

test('hub auto-setup also creates the labels, and a label failure does not block the Sheet', () => {
  const ctx = makeHubContext({ realStores: 'cold' });
  ctx.__hub.gmail.failLabelCreate = 'Label create 500';
  const st = call(ctx, 'getHubStatus');
  assert.equal(st.ok, true, JSON.stringify(st));
  assert.ok(created(ctx).length > 0, 'tried to create labels');
  assert.match(ctx.__consoleLines.join('\n'), /could not create the Day Planner Gmail labels[\s\S]*Label create 500/);
});

function filterCtx() {
  const ctx = makeHubContext({ realStores: true, features: { GMAIL_ROUTER: true, TRIAGE_BOARD: true } });
  const h = ctx.__hub.gmail;
  EIGHT.forEach((n) => h.labelId(n));
  for (let i = 1; i <= 4; i++) addThread(ctx, { id: `task${i}`, archived: true, labels: ['🎯/Task'], from: 'NCMMS <noreply@ncmms.gov>', subject: `Work order ${i} has been assigned to you` });
  for (let i = 1; i <= 5; i++) addThread(ctx, { id: `in${i}`, labels: ['INBOX'], from: `Colleague ${i} <c${i}@agency.gov>`, subject: `Lunch plans ${i}` });
  addThread(ctx, { id: 'notes1', archived: true, labels: ['🎯/Read'], from: 'gemini-notes@google.com', subject: 'Notes: weekly' });
  h.filters.push({ id: 'OLD1', criteria: { from: 'gemini-notes@google.com' }, action: { addLabelIds: [h.labelId('🎯/Read')] } });
  h.queryHits['from:(noreply@ncmms.gov)'] = ['task1', 'task2', 'task3', 'task4'];
  h.queryHits['from:(gemini-notes@google.com)'] = ['notes1'];
  h.queryHits['subject:"assigned to you"'] = ['task1', 'task2', 'task3', 'in1'];
  return ctx;
}

const tab = (ctx) => {
  const sp = Object.values(ctx.__fakes.sheets)[0];
  return sp.tabs.find((t) => t.title === 'Filter Suggestions');
};
const rowsOf = (ctx) => {
  const [head, ...rest] = tab(ctx).rows;
  return rest.filter((r) => r[0]).map((r) => Object.fromEntries(head.map((k, i) => [k, r[i]])));
};

test('suggest: existing 🎯 filters, a learned suggestion and pasted rows, each measured with Gmail search', () => {
  const ctx = filterCtx();
  // The user pasted a Gemini query into the tab before running.
  call(ctx, 'hubSuggestFilters');
  tab(ctx).rows.push(['🎯/Task', 'subject:"assigned to you"', 'Gemini', '', '', '', '', false, '', '']);
  const r = call(ctx, 'hubSuggestFilters');
  assert.equal(r.ok, true, JSON.stringify(r));
  const rows = rowsOf(ctx);
  const existing = rows.find((x) => x.Source === 'Existing filter');
  assert.deepEqual([existing.Label, existing['Gmail query'], existing['Filter id']], ['🎯/Read', 'from:(gemini-notes@google.com)', 'OLD1']);
  const sug = rows.find((x) => x.Source === 'Suggested' && x['Gmail query'] === 'from:(noreply@ncmms.gov)');
  assert.ok(sug, JSON.stringify(rows));
  assert.deepEqual([sug['Caught (90 days)'], sug['Wrong (90 days)'], sug.Precision], ['4', '0', 1]);
  const gem = rows.find((x) => x.Source === 'Gemini');
  assert.deepEqual([gem['Caught (90 days)'], gem['Wrong (90 days)'], gem.Precision], ['3', '1', 0.75], 'pasted row kept and measured');
  assert.ok(!rows.some((x) => x.Label === '🎯/Task-Today' || x.Label === '🎯/Waiting'), 'never suggests the manual labels');
  assert.ok(ctx.__fakes.sheetsCalls.some((c) => c.method === 'setDataValidation' && c.type === 'BOOLEAN'), 'Create? is a checkbox column');
});

test('suggest without the filter scope says so and writes nothing', () => {
  const ctx = filterCtx();
  ctx.__hub.gmail.filtersBlocked = true;
  const r = call(ctx, 'hubSuggestFilters');
  assert.equal(r.ok, false);
  assert.equal(r.errorCode, 'SCOPE_BLOCKED');
  assert.equal(tab(ctx), undefined);
});

test('create: only ticked rows, only add-label filters, written back, and a rerun creates nothing new', () => {
  const ctx = filterCtx();
  call(ctx, 'hubSuggestFilters');
  const t = tab(ctx);
  const head = t.rows[0];
  const qi = head.indexOf('Gmail query');
  const ci = head.indexOf('Create?');
  const row = t.rows.find((x) => x[qi] === 'from:(noreply@ncmms.gov)');
  row[ci] = 'TRUE';
  t.rows.push(['INBOX', 'from:(x@y.gov)', 'Pasted', '', '', '', '', 'TRUE', '', '']);
  const r = call(ctx, 'hubCreateSelectedFilters');
  assert.equal(r.created, 1, JSON.stringify(r));
  const made = ctx.__hub.gmail.calls.filter((c) => c.startsWith('filters.create:')).map((c) => JSON.parse(c.slice('filters.create:'.length)));
  assert.deepEqual(made, [{ criteria: { query: 'from:(noreply@ncmms.gov)' }, action: { addLabelIds: [ctx.__hub.gmail.labelId('🎯/Task')] } }]);
  const rows = rowsOf(ctx);
  const done = rows.find((x) => x['Gmail query'] === 'from:(noreply@ncmms.gov)');
  assert.match(done.Status, /^Created /);
  assert.ok(done['Filter id']);
  assert.equal(rows.find((x) => x.Label === 'INBOX').Status, 'Skipped: not a Day Planner label');
  const again = call(ctx, 'hubCreateSelectedFilters');
  assert.equal(again.created, 0);
});

test('every new RPC has an IIFE alias and a top-level delegator', () => {
  const code = fs.readFileSync(new URL('../gas-app/Code.gs', import.meta.url), 'utf8');
  const hub = fs.readFileSync(new URL('../gas-app/HubController.gs', import.meta.url), 'utf8');
  for (const n of ['hubSetupLabels', 'hubSuggestFilters', 'hubCreateSelectedFilters']) {
    assert.match(code, new RegExp(`^function ${n}\\(\\) \\{`, 'm'), n);
    assert.match(hub, new RegExp(`global\\._${n}Internal = ${n};`), n);
  }
  assert.match(fs.readFileSync(new URL('../gas-app/appsscript.json', import.meta.url), 'utf8'), /gmail\.settings\.basic/);
});
