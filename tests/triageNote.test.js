/**
 * @file triageNote.test.js
 * @description Triage "Note" action: appends the thread to the last note card of today, toasts the result, and
 * fails loud (toast, no write) when today is not the open day or has no note card. Runs against BOTH client copies.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm } from './helpers/plannerHarness.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

const item = { threadId: 't1', subject: 'Vendor call', fromName: 'Pat', url: 'u1', labels: [] };

function vmFor(c, { cards, selectedDate }) {
  const toasts = [];
  const vm = makeVm(c.factory, { hubFlags: { GMAIL_ROUTER: true, TRIAGE_BOARD: true }, hubNowMs: Date.now() });
  vm.showTaskToast = (msg) => { toasts.push(msg); };
  vm.syncCardsToDailyNote = () => { vm.synced = true; };
  vm.selectedDate = selectedDate === 'today' ? vm.todayStr : '1999-01-01';
  vm.noteCards = cards;
  return { vm, toasts };
}

const clients = await bothClients();

describe('Triage Note action', () => {
  beforeEach(() => {
    globalThis.sessionStorage = fakeStorage();
    globalThis.localStorage = fakeStorage();
  });
  for (const c of clients) {
    describe(c.label, () => {
      it('appends a line to the last card of today and toasts', () => {
        const { vm, toasts } = vmFor(c, { cards: [{ content: 'a' }, { content: 'b\n' }], selectedDate: 'today' });
        vm.noteTriageItem(item);
        assert.equal(vm.noteCards[0].content, 'a');
        assert.equal(vm.noteCards[1].content, 'b\n- Vendor call (Pat) u1');
        assert.ok(vm.synced);
        assert.deepEqual(toasts, ['Note: added to today']);
      });
      it('refuses when another day is open', () => {
        const { vm, toasts } = vmFor(c, { cards: [{ content: 'a' }], selectedDate: 'other' });
        vm.noteTriageItem(item);
        assert.equal(vm.noteCards[0].content, 'a');
        assert.equal(toasts.length, 1);
        assert.match(toasts[0], /^Note failed: .*today/);
      });
      it('refuses when today has no note card', () => {
        const { vm, toasts } = vmFor(c, { cards: [], selectedDate: 'today' });
        vm.noteTriageItem(item);
        assert.equal(toasts.length, 1);
        assert.match(toasts[0], /^Note failed: .*note card/);
      });
    });
  }
});
