/**
 * @file toastDismissDrag.test.js
 * @description User 2026-11-13: the action toast (e.g. "Deleted ...") gets a dismiss X and can be dragged out of the
 * way. Dismiss hides it only; a pending delete still commits. Dragging pauses the auto-hide, re-arms it on release,
 * and a new toast starts back at its own spot. Runs against BOTH client copies.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm } from './helpers/plannerHarness.js';

const clients = await bothClients();

const ptr = (x, y, extra = {}) => ({
  clientX: x,
  clientY: y,
  pointerId: 1,
  button: 0,
  target: { closest: () => null },
  currentTarget: { setPointerCapture() {}, releasePointerCapture() {} },
  ...extra
});

describe('toast dismiss and drag', () => {
  for (const c of clients) {
    describe(c.label, () => {
      const vm = () => {
        const v = makeVm(c.factory, {});
        v.applyToastAnchor = () => {};
        v.applyToastDrag = (x, y) => { v.painted = { x, y }; };
        v.viewportSize = () => ({ width: 1200, height: 800 });
        return v;
      };

      it('dismissTaskToast hides the toast and its undo, and stops the auto-hide timer', () => {
        const v = vm();
        v.showTaskToast('Deleted "x".', { kind: 'eventDelete' });
        v.dismissTaskToast();
        assert.equal(v.taskToast, null);
        assert.equal(v.taskToastUndo, null);
      });

      it('dragging moves the toast by the pointer delta', () => {
        const v = vm();
        v.showTaskToast('hello');
        v.startToastDrag(ptr(500, 300));
        v.moveToastDrag(ptr(440, 340));
        assert.deepEqual(v.painted, { x: -60, y: 40 });
        v.endToastDrag(ptr(440, 340));
        clearTimeout(v.taskToastTimer);
      });

      it('a drag that starts on a button does not move the toast', () => {
        const v = vm();
        v.showTaskToast('hello');
        v.painted = undefined;
        v.startToastDrag(ptr(500, 300, { target: { closest: () => ({}) } }));
        v.moveToastDrag(ptr(440, 340));
        assert.equal(v.painted, undefined);
        clearTimeout(v.taskToastTimer);
      });

      it('the auto-hide timer is paused while dragging and re-armed on release', () => {
        const v = vm();
        v.showTaskToast('hello');
        const before = v.taskToastTimer;
        v.startToastDrag(ptr(500, 300));
        assert.notEqual(v.taskToastTimer, before);
        assert.equal(v.taskToastTimer, null);
        v.endToastDrag(ptr(500, 300));
        assert.notEqual(v.taskToastTimer, null);
        clearTimeout(v.taskToastTimer);
      });

      it('a new toast resets the drag offset', () => {
        const v = vm();
        v.showTaskToast('one');
        v.startToastDrag(ptr(500, 300));
        v.moveToastDrag(ptr(400, 300));
        v.endToastDrag(ptr(400, 300));
        v.showTaskToast('two');
        assert.deepEqual(v.painted, { x: 0, y: 0 });
        clearTimeout(v.taskToastTimer);
      });
    });
  }
});
