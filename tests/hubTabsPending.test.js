/**
 * @file hubTabsPending.test.js
 * @description Load speed (2026-11-06): until the hub status answers on a first-ever visit, the nav keeps room for the
 * Triage and Meeting Prep tabs so they do not push About and the right-hand buttons when they appear. Runs against
 * BOTH client copies.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm } from './helpers/plannerHarness.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const clients = await bothClients({});

describe('hub tab room while the hub status is unknown', () => {
  beforeEach(() => {
    globalThis.sessionStorage = fakeStorage();
    globalThis.localStorage = fakeStorage();
  });

  for (const c of clients) {
    it(c.label + ': room is reserved until the status answers, then released', async () => {
      const vm = makeVm(c.factory, { bridge: { getHubStatus: async () => ({ ok: true, flags: { GMAIL_ROUTER: true, TRIAGE_BOARD: true } }) } });
      vm.reportError = () => {};
      vm.resolveError = () => {};
      vm.loadFiledEmails = () => {};
      assert.equal(vm.hubTabsPending, true);
      await vm.loadHubStatus();
      assert.equal(vm.hubTabsPending, false);
    });

    it(c.label + ': a failed status also releases the room', async () => {
      const vm = makeVm(c.factory, { bridge: { getHubStatus: async () => { throw new Error('down'); } } });
      vm.reportError = () => {};
      vm.resolveError = () => {};
      const orig = console.error;
      console.error = () => {};
      try { await vm.loadHubStatus(); } finally { console.error = orig; }
      assert.equal(vm.hubTabsPending, false);
    });

    it(c.label + ': saved flags show the tabs at once, so nothing is reserved', () => {
      const vm = makeVm(c.factory, { bridge: {} });
      vm.hubFlags = { GMAIL_ROUTER: true, TRIAGE_BOARD: true };
      assert.equal(vm.hubTabsPending, false);
    });
  }
});
