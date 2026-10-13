/**
 * @file triageCache.test.js
 * @description Triage loads slowly (getTriageBoard ~6.5 s live). The last board is kept in sessionStorage
 * (this tab only, cleared when it closes) and shown at once, marked stale, while a fresh board loads in the
 * background. Row actions stay disabled until fresh data lands. Only allowlisted item fields are stored.
 * Runs against BOTH client copies (src/app.js and gas-app/Script.html).
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bothClients, makeVm, captureConsoleError } from './helpers/plannerHarness.js';

const KEY = 'dayPlannerTriageBoard.v1';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

const ITEM = { threadId: 't1', url: 'https://mail.google.com/mail/u/0/#all/t1', subject: 'Approve', snippet: 'Please approve', fromName: 'Pat', date: '2026-10-12T09:00:00Z',
  labels: ['00_AR'], score: 9, band: 'HIGH_CONFIDENCE', signals: ['to-you'], queue: 'DIRECT_ACTION', ticketKey: null, suggestions: [], requireConfirmation: false,
  humanReviewOnly: false, operationKey: null, ledgerStatus: null, errorMessage: null };
const board = (items = [ITEM]) => ({ ok: true, status: 'OK', queues: { directAction: items, meetingCarryIns: [], systemExceptions: [], fyiReading: [] } });

function vmFor(c, bridge = {}) {
  const errors = [];
  const vm = makeVm(c.factory, { bridge, hubNowMs: Date.parse('2026-10-12T10:00:00Z') });
  vm.reportError = (key, msg) => errors.push({ key, msg });
  vm.resolveError = () => {};
  vm._errors = errors;
  return vm;
}

const clients = await bothClients();

describe('Triage board cache (stale-while-revalidate)', () => {
  beforeEach(() => { globalThis.sessionStorage = fakeStorage(); });

  for (const c of clients) {
    describe(c.label, () => {
      it('a fresh load stores only allowlisted item fields and clears the stale mark', async () => {
        const vm = vmFor(c, { getTriageBoard: async () => board([{ ...ITEM, bodyText: 'SECRET BODY', extra: 1 }]) });
        await vm.loadTriageBoard();
        assert.equal(vm.triageStale, false);
        const saved = JSON.parse(sessionStorage.getItem(KEY));
        assert.equal(typeof saved.savedAt, 'number');
        const stored = saved.queues.directAction[0];
        assert.deepEqual(Object.keys(stored).sort(), Object.keys(ITEM).sort());
        assert.ok(!sessionStorage.getItem(KEY).includes('SECRET BODY'));
      });

      it('hydrate shows the saved board marked stale; a failed refresh keeps it and reports the error', async () => {
        sessionStorage.setItem(KEY, JSON.stringify({ savedAt: Date.parse('2026-10-12T09:55:00Z'), queues: board().queues }));
        const vm = vmFor(c, { getTriageBoard: async () => { throw new Error('timeout'); } });
        vm.hydrateTriageCache();
        assert.equal(vm.triageItemCount, 1);
        assert.equal(vm.triageStale, true);
        assert.match(vm.triageStatusText, /Saved 5 min ago/);
        const logged = await captureConsoleError(() => vm.loadTriageBoard());
        assert.equal(vm.triageItemCount, 1, 'saved rows stay on screen');
        assert.equal(vm.triageStale, true);
        assert.equal(vm._errors[0].key, 'load-triage');
        assert.ok(logged.some((l) => /timeout/.test(l)));
      });

      it('hydrate never overwrites a board that is already loaded', async () => {
        sessionStorage.setItem(KEY, JSON.stringify({ savedAt: 1, queues: board([]).queues }));
        const vm = vmFor(c, { getTriageBoard: async () => board() });
        await vm.loadTriageBoard();
        vm.hydrateTriageCache();
        assert.equal(vm.triageItemCount, 1);
        assert.equal(vm.triageStale, false);
      });

      it('overlapping loads (prefetch plus opening Triage) share one RPC', async () => {
        let calls = 0;
        let release;
        const vm = vmFor(c, { getTriageBoard: () => { calls += 1; return new Promise((r) => { release = () => r(board()); }); } });
        const a = vm.loadTriageBoard();
        const b = vm.loadTriageBoard();
        release();
        await Promise.all([a, b]);
        assert.equal(calls, 1);
        assert.equal(vm.triageLoading, false);
      });

      it('malformed or wrong-shape cache is ignored with a logged error', async () => {
        sessionStorage.setItem(KEY, '{not json');
        const vm = vmFor(c);
        const logged = await captureConsoleError(() => vm.hydrateTriageCache());
        assert.equal(vm.triageItemCount, 0);
        assert.equal(vm.triageStale, false);
        assert.ok(logged.length >= 1);
        sessionStorage.setItem(KEY, JSON.stringify({ savedAt: 1, queues: 'nope' }));
        vm.hydrateTriageCache();
        assert.equal(vm.triageItemCount, 0);
      });

      it('hub status AUTH_REQUIRED or failure clears the saved board', async () => {
        sessionStorage.setItem(KEY, JSON.stringify({ savedAt: 1, queues: board().queues }));
        const vm = vmFor(c, { getHubStatus: async () => ({ ok: false, status: 'AUTH_REQUIRED', authUrl: 'https://example.test/auth' }) });
        await vm.loadHubStatus();
        assert.equal(sessionStorage.getItem(KEY), null);
        assert.equal(vm.triageItemCount, 0);
      });

      it('status text: loading with no board, refreshing over a saved board, none when fresh', async () => {
        const vm = vmFor(c);
        vm.triageBoard = null;
        vm.triageLoading = true;
        assert.equal(vm.triageStatusText, 'Loading…');
        vm.triageBoard = board();
        vm.triageStale = true;
        vm.triageSavedAt = Date.parse('2026-10-12T08:00:00Z');
        assert.equal(vm.triageStatusText, 'Saved 2 h ago · Refreshing…');
        vm.triageLoading = false;
        vm.triageStale = false;
        assert.equal(vm.triageStatusText, '');
      });
    });
  }
});

for (const f of ['index.html', 'gas-app/Index.html']) {
  it(`${f}: row actions are disabled while the board is stale; status text shown; sender and date split`, () => {
    const html = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    const start = html.indexOf('<td class="hub-col-actions">');
    const actions = html.slice(start, html.indexOf('</td>', start));
    const buttons = actions.match(/<button [^>]*>/g) || [];
    assert.equal(buttons.length, 8);
    for (const b of buttons) assert.match(b, /:disabled="triageStale"/, b);
    assert.match(html, /@click="retryTriageItem\(item\)" :disabled="triageStale"/);
    assert.match(html, /x-text="triageStatusText"/);
    assert.match(html, /class="hub-from-name" x-text="item\.fromName"/);
    assert.match(html, /class="hub-from-date"/);
  });
}

it('docs say where the board copy lives', () => {
  const doc = fs.readFileSync(new URL('../docs/hub-architecture.md', import.meta.url), 'utf8');
  assert.match(doc, /sessionStorage/);
});
