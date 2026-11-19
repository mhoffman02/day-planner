/**
 * @file hubSnippetHover.test.js
 * @description Triage THREAD column (user 2026-11-18): hovering the preview expands it, not only a click. A short
 * delay keeps a mouse sweeping down the list from opening every row; a click still pins a row open after the mouse
 * leaves. Runs against both client copies via plannerHarness, plus a markup check of both Index copies.
 */
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bothClients, makeVm } from './helpers/plannerHarness.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** Hand-driven timers: nothing fires until the test says so, so no real clock decides the outcome. */
const pending = new Map();
let nextId = 1;
const timers = {
  setTimeout: (fn) => { const id = nextId++; pending.set(id, fn); return id; },
  clearTimeout: (id) => { pending.delete(id); }
};
const fireTimers = () => { for (const [id, fn] of [...pending]) { pending.delete(id); fn(); } };
const clients = await bothClients({ timers });

for (const c of clients) {
  describe(`Triage snippet hover [${c.label}]`, () => {
    it('hovering opens the preview after a short delay, and leaving closes it', () => {
      const v = makeVm(c.factory, {});
      v.hoverSnippet('t1');
      assert.equal(v.isSnippetOpen('t1'), false, 'not open before the delay');
      fireTimers();
      assert.equal(v.isSnippetOpen('t1'), true);
      assert.equal(v.isSnippetOpen('t2'), false);
      v.leaveSnippet();
      assert.equal(v.isSnippetOpen('t1'), false);
    });

    it('leaving before the delay cancels the open, so a sweep down the list opens nothing', () => {
      const v = makeVm(c.factory, {});
      v.hoverSnippet('t1');
      v.leaveSnippet();
      v.hoverSnippet('t2');
      v.leaveSnippet();
      fireTimers();
      assert.equal(v.isSnippetOpen('t1'), false);
      assert.equal(v.isSnippetOpen('t2'), false);
    });

    it('a click pins the row open after the mouse leaves; a second click closes it', () => {
      const v = makeVm(c.factory, {});
      v.hoverSnippet('t1');
      fireTimers();
      v.toggleSnippet('t1');
      v.leaveSnippet();
      assert.equal(v.isSnippetOpen('t1'), true, 'pinned');
      v.toggleSnippet('t1');
      assert.equal(v.isSnippetOpen('t1'), false);
    });
  });
}

for (const f of ['index.html', 'gas-app/Index.html']) {
  test(`${f}: the preview button opens on mouseenter and closes on mouseleave, and every state check goes through isSnippetOpen`, () => {
    const html = read(f);
    assert.match(html, /class="hub-snippet"[^>]*@mouseenter="hoverSnippet\(item\.threadId\)" @mouseleave="leaveSnippet\(\)"/);
    assert.match(html, /x-text="isSnippetOpen\(item\.threadId\) \? \(item\.preview \|\| item\.snippet\) : item\.snippet"/);
    assert.doesNotMatch(html, /hubSnippetOpenId === item\.threadId/);
  });
}
