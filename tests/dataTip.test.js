/**
 * @file dataTip.test.js
 * @description Floating callout for [data-tip] controls (user 2026-11-18: the CSS-only bubble was clipped by the row
 * list, so JS places one fixed-position bubble from the control rectangle). dataTipPlacement is pure; initDataTips is
 * driven here with a fake document and a fake timer, so nothing waits on a real clock.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataTipPlacement, initDataTips } from '../src/dataTip.js';

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const view = { width: 400, height: 600 };

test('above the control by default, centered on it, 24px clear of the cursor', () => {
  const p = dataTipPlacement(rect(180, 100, 20, 20), { width: 100, height: 28 }, view);
  assert.deepEqual({ side: p.side, left: p.left, top: p.top }, { side: 'top', left: 140, top: 100 - 24 - 28 });
  assert.equal(p.tailLeft, 50);
});

test('flips below when there is no room above, and above when there is no room below', () => {
  const high = dataTipPlacement(rect(180, 2, 20, 20), { width: 100, height: 28 }, view);
  assert.deepEqual({ side: high.side, top: high.top }, { side: 'bottom', top: 22 + 24 });
  const low = dataTipPlacement(rect(180, 560, 20, 20), { width: 100, height: 28 }, view, 'bottom');
  assert.deepEqual({ side: low.side, top: low.top }, { side: 'top', top: 560 - 24 - 28 });
});

test('data-tip-pos bottom is the preferred side while it fits', () => {
  const p = dataTipPlacement(rect(180, 300, 20, 20), { width: 100, height: 28 }, view, 'bottom');
  assert.equal(p.side, 'bottom');
});

test('clamps inside the viewport and the tail still points at the control', () => {
  const right = dataTipPlacement(rect(385, 100, 10, 20), { width: 120, height: 28 }, view);
  assert.equal(right.left, 400 - 120 - 8);
  assert.equal(right.tailLeft, 120 - 12, 'tail stops 12px short of the bubble corner');
  const left = dataTipPlacement(rect(0, 100, 10, 20), { width: 120, height: 28 }, view);
  assert.equal(left.left, 8);
  assert.equal(left.tailLeft, 12);
});

test('a bubble wider than the viewport pins to the left margin', () => {
  assert.equal(dataTipPlacement(rect(50, 100, 10, 10), { width: 500, height: 28 }, view).left, 8);
});

function fakeDoc(anchorRect) {
  const listeners = {};
  const made = [];
  const mkEl = () => ({
    className: '', textContent: '', style: { setProperty(k, v) { this[k] = v; } }, attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; }, getBoundingClientRect() { return rect(0, 0, 100, 28); },
  });
  const anchor = {
    ...mkEl(), getBoundingClientRect: () => anchorRect,
    getAttribute: (k) => ({ 'data-tip': 'Email attendees', 'data-tip-pos': null })[k] ?? null,
    matches: () => true, closest() { return this; },
  };
  const doc = {
    body: { appendChild: (el) => made.push(el) },
    createElement: () => mkEl(),
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
  };
  return { doc, anchor, made, fire: (type, target = anchor) => (listeners[type] || []).forEach((fn) => fn({ target, key: 'Escape' })) };
}

function fakeTimers() {
  let pending = null;
  return { set: (fn) => { pending = fn; return 1; }, clear: () => { pending = null; }, run: () => { const f = pending; pending = null; if (f) f(); }, has: () => pending !== null };
}

test('initDataTips: hover waits for the delay, then shows one body-level bubble placed from the control', () => {
  const { doc, anchor, made, fire } = fakeDoc(rect(180, 100, 20, 20));
  const timers = fakeTimers();
  initDataTips(doc, { innerWidth: 400, innerHeight: 600 }, timers);
  fire('mouseover');
  assert.equal(made.length, 1, 'one bubble appended to the body');
  assert.ok(timers.has());
  assert.equal(made[0].className.includes('is-shown'), false);
  timers.run();
  assert.equal(made[0].textContent, 'Email attendees');
  assert.ok(made[0].className.includes('is-shown'));
  assert.equal(made[0].style.left, '140px');
  assert.equal(made[0].style.top, '48px');
  assert.equal(made[0].attrs['data-side'], 'top');
  assert.equal(made[0].style['--tip-tail-x'], '50px');
  fire('mouseout', anchor);
  assert.equal(made[0].className.includes('is-shown'), false);
});

test('initDataTips: leaving before the delay, a click, Escape and scrolling all cancel or hide it', () => {
  const { doc, made, fire } = fakeDoc(rect(180, 100, 20, 20));
  const timers = fakeTimers();
  initDataTips(doc, { innerWidth: 400, innerHeight: 600 }, timers);
  fire('mouseover');
  fire('mouseout');
  assert.equal(timers.has(), false);
  for (const type of ['mousedown', 'keydown', 'scroll']) {
    fire('mouseover');
    timers.run();
    assert.ok(made[0].className.includes('is-shown'), type + ' precondition');
    fire(type);
    assert.equal(made[0].className.includes('is-shown'), false, type + ' hides it');
  }
});

test('initDataTips: a control with no data-tip never shows a bubble', () => {
  const { doc, fire } = fakeDoc(rect(0, 0, 10, 10));
  const timers = fakeTimers();
  initDataTips(doc, { innerWidth: 400, innerHeight: 600 }, timers);
  fire('mouseover', { closest: () => null });
  assert.equal(timers.has(), false);
});
