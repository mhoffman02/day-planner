/**
 * @file toastAnchor.test.js
 * @description User 2026-11-06: the action toast should sit up-left of the click or button that raised it, its bottom
 * about 1em above the click and its right edge at the click, so the eye does not travel to the top right. Without a
 * recent pointer (keyboard action) the toast keeps its fixed spot. Runs against BOTH client copies.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm } from './helpers/plannerHarness.js';

const clients = await bothClients();
const VIEW = { width: 1200, height: 800 };

describe('toast anchor', () => {
  for (const c of clients) {
    describe(c.label, () => {
      const vm = () => makeVm(c.factory, {});
      it('puts the right edge at the click and the bottom 16 px above it', () => {
        const a = vm().toastAnchorFor({ x: 900, y: 500, at: 1000 }, VIEW, 1500);
        assert.deepEqual(a, { right: 300, bottom: 316 });
      });
      it('keeps the toast on screen when the click is near the left or top edge', () => {
        const left = vm().toastAnchorFor({ x: 20, y: 500, at: 1000 }, VIEW, 1500);
        assert.equal(left.right, VIEW.width - 280);
        const top = vm().toastAnchorFor({ x: 900, y: 10, at: 1000 }, VIEW, 1500);
        assert.equal(top.bottom, VIEW.height - 80);
      });
      it('returns null without a pointer or when the pointer is older than 30 s', () => {
        assert.equal(vm().toastAnchorFor(null, VIEW, 1500), null);
        assert.equal(vm().toastAnchorFor({ x: 900, y: 500, at: 1000 }, VIEW, 1000 + 30001), null);
      });
      it('showTaskToast sets the anchor from the last pointer and clears it without one', () => {
        const v = vm();
        v.applyToastAnchor = (a) => { v.seen = a; };
        v.lastPointer = { x: 900, y: 500, at: Date.now() };
        v.viewportSize = () => VIEW;
        v.showTaskToast('hello');
        assert.deepEqual(v.seen, { right: 300, bottom: 316 });
        v.lastPointer = null;
        v.showTaskToast('again');
        assert.equal(v.seen, null);
        clearTimeout(v.taskToastTimer);
      });
    });
  }
});
