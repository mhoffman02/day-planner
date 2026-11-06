/**
 * @file loadToast.test.js
 * @description User 2026-11-06 (WORK): the "Loading Doc items..." toast sat over the tabs for 1-2 minutes. It now shows
 * at most 4 s per load start, and not at all once loading ends. Runs against BOTH client copies.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm, settle } from './helpers/plannerHarness.js';

const clients = await bothClients();

for (const c of clients) {
  describe(`load toast [${c.label}]`, () => {
    it('flashLoadToast shows the toast while loading, then the timer fades it even though loading continues', async () => {
      const vm = makeVm(c.factory, {});
      vm.docLoading = true;
      vm.flashLoadToast();
      assert.equal(vm.loadToastVisible(), true);
      await settle();
      assert.equal(vm.docLoading, true);
      assert.equal(vm.loadToastVisible(), false);
    });

    it('is hidden when loading has ended even inside the 4 s window', () => {
      const vm = makeVm(c.factory, {});
      vm.loadToastShown = true;
      vm.docLoading = false;
      vm.triageLoading = false;
      assert.equal(vm.loadToastVisible(), false);
    });
  });
}
