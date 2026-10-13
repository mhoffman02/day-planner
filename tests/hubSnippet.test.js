/**
 * @file hubSnippet.test.js
 * @description Triage rows show a one-line preview: Gmail's own snippet of the LATEST message (Gmail's inbox
 * pattern). The snippet goes to the board RPC only; it never reaches logs, properties, ledger, Tasks or Docs.
 * Full bodies are still never returned.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { toHost } from './helpers/gasRuntimeStubs.js';
import { makeHubContext, addThread, addCoreOccurrences, lines } from './helpers/gasFakesHub.js';
import { HubMock } from '../src/hubMock.js';

const call = (ctx, name, ...args) => toHost(ctx[`_${name}Internal`](...args));
const items = (board) => Object.values(board.queues).flat();

function seed(ctx) {
  addThread(ctx, {
    id: 't1', labels: ['00_AR'], subject: 'Approval needed', messages: [
      { from: 'Pat <pat@example.test>', body: 'first body', snippet: 'Old first message' },
      { from: 'Lee <lee@example.test>', body: 'second body', snippet: 'Latest: can you sign &amp; send by Friday? It&#39;s &quot;urgent&quot; &lt;3' }
    ]
  });
}

test('board item carries the latest message snippet, HTML entities decoded', () => {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, TRIAGE_BOARD: true, DRY_RUN: true } });
  seed(ctx);
  const item = items(call(ctx, 'getTriageBoard', {})).find((i) => i.threadId === 't1');
  assert.equal(item.snippet, 'Latest: can you sign & send by Friday? It\'s "urgent" <3');
  assert.ok(!('bodyText' in item));
});

test('snippet is capped at 300 characters', () => {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, TRIAGE_BOARD: true, DRY_RUN: true } });
  addThread(ctx, { id: 't1', labels: ['00_AR'], subject: 'Long', snippet: 'x'.repeat(500) });
  const item = items(call(ctx, 'getTriageBoard', {}))[0];
  assert.equal(item.snippet.length, 300);
});

test('countOnly board reads do not return snippets', () => {
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, TRIAGE_BOARD: true, DRY_RUN: true } });
  seed(ctx);
  const item = items(call(ctx, 'getTriageBoard', { countOnly: true }))[0];
  assert.equal(item.snippet, '');
});

test('snippet never reaches logs, properties, ledger, Tasks, Docs or other RPC returns', () => {
  const CANARY = 'CANARY_SNIPPET_19be';
  const ctx = makeHubContext({ features: { GMAIL_ROUTER: true, TRIAGE_BOARD: true, NCMMS_CORE_PILOT: true, DRY_RUN: false } });
  addCoreOccurrences(ctx);
  addThread(ctx, { id: 't1', labels: ['🎯/Task', '00_AR'], subject: 'Plain subject', snippet: CANARY });
  addThread(ctx, { id: 't2', labels: ['🎯/Meeting/NCMMS-Core'], subject: 'Core item', snippet: CANARY });
  addThread(ctx, { id: 't3', labels: ['🎯/Task'], subject: 'Fails', snippet: CANARY });
  ctx.__hub.tasks.onInsert = (res) => { if (res.title === 'Fails') throw new Error('backend exploded'); };
  assert.ok(JSON.stringify(call(ctx, 'getTriageBoard', {})).includes(CANARY), 'board shows the snippet');
  const others = [call(ctx, 'processWorkflowQueue'), call(ctx, 'getHubStatus'), call(ctx, 'getUpcomingMeetingChoices', 't2'), call(ctx, 'getMeetingPrep', 'NCMMS_CORE', null),
    call(ctx, 'routeThreadToTask', 't1', { today: true })];
  const props = JSON.stringify(ctx.PropertiesService.getUserProperties().getProperties());
  const haystack = JSON.stringify([others, lines(ctx), props, [...ctx.__hub.ledger.rows.values()], ctx.__hub.tasks.items, ctx.__hub.notes.docs]);
  assert.ok(!haystack.includes(CANARY), 'a snippet leaked');
});

test('local mock items carry a snippet string', () => {
  const mock = new HubMock();
  const board = mock.getTriageBoard({});
  assert.ok(items(board).every((i) => typeof i.snippet === 'string'));
  assert.ok(items(board).some((i) => i.snippet.length > 20));
});

for (const f of ['index.html', 'gas-app/Index.html']) {
  test(`${f}: Thread cell shows item.snippet in an expandable preview button`, () => {
    const html = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.match(html, /class="hub-snippet"[^>]*:aria-expanded="hubSnippetOpenId === item\.threadId"[^>]*@click="toggleSnippet\(item\.threadId\)"/);
    assert.match(html, /x-show="item\.snippet"/);
    assert.match(html, /x-text="item\.snippet"/);
  });
}
