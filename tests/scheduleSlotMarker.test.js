/**
 * @file scheduleSlotMarker.test.js
 * @description The Today-tab Appointments panel marks the half-hour slot that contains now ("now") and the slot after
 * it ("next") with a gold bar left of the time. Only on local today, only inside the 07:00 to 19:30 grid. Runs against
 * both client copies via plannerHarness, plus a markup and style check of both Index and style copies.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bothClients, makeVm } from './helpers/plannerHarness.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const at = (h, m) => new Date(2031, 2, 12, h, m, 0).getTime();

for (const c of await bothClients()) {
  describe(`schedule slot marker [${c.label}]`, () => {
    const vm = (nowMs, over = {}) => makeVm(c.factory, { selectedDate: '2031-03-12', todayStr: '2031-03-12', clockNowMs: nowMs, ...over });
    const marks = (v) => Object.fromEntries(['07:00', '07:30', '08:00', '08:30', '18:30', '19:00'].map((k) => [k, v.slotMarker(k)]));

    it('8:13 marks 8:00 as now and 8:30 as next', () => {
      const m = marks(vm(at(8, 13)));
      assert.equal(m['08:00'], 'now');
      assert.equal(m['08:30'], 'next');
      assert.equal(m['07:30'], '');
      assert.equal(m['07:00'], '');
    });

    it('exactly 8:30 moves the marker to the 8:30 slot', () => {
      const m = marks(vm(at(8, 30)));
      assert.equal(m['08:30'], 'now');
      assert.equal(m['08:00'], '');
    });

    it('18:45 marks 18:30 now and 19:00 next; 19:10 marks 19:00 now with no next', () => {
      const a = marks(vm(at(18, 45)));
      assert.equal(a['18:30'], 'now');
      assert.equal(a['19:00'], 'next');
      const b = marks(vm(at(19, 10)));
      assert.equal(b['19:00'], 'now');
      assert.equal(b['18:30'], '');
    });

    it('marks nothing before 07:00 or after 19:30', () => {
      for (const t of [at(6, 50), at(19, 30), at(23, 59)]) {
        assert.deepEqual(Object.values(marks(vm(t))).filter(Boolean), [], String(new Date(t)));
      }
    });

    it('marks nothing when the panel shows another day', () => {
      const v = vm(at(8, 13), { selectedDate: '2031-03-13' });
      assert.deepEqual(Object.values(marks(v)).filter(Boolean), []);
    });
  });
}

describe('schedule slot marker markup and styles', () => {
  it('both Index copies bind the row class and aria-current to slotMarker', () => {
    for (const p of ['gas-app/Index.html', 'index.html']) {
      const src = read(p);
      assert.match(src, /'slot-now': slotMarker\(slot\.timeKey\) === 'now'/, p);
      assert.match(src, /'slot-next': slotMarker\(slot\.timeKey\) === 'next'/, p);
      assert.match(src, /:aria-current="slotMarker\(slot\.timeKey\) === 'now' \? 'time' : null"/, p);
    }
  });

  it('both style copies draw the bar as an inset shadow from one shared gold variable', () => {
    for (const p of ['src/styles.css', 'gas-app/Styles.html']) {
      const css = read(p);
      assert.match(css, /--tab-gold:\s*#d4a017/, p);
      assert.match(css, /\.schedule-row\.slot-now time\.schedule-time\s*\{[^}]*inset 3px 0 0 var\(--tab-gold\)/, p);
      assert.match(css, /\.schedule-row\.slot-next time\.schedule-time\s*\{[^}]*inset 3px 0 0/, p);
      assert.match(css, /\[data-theme="dark"\] \.schedule-row\.slot-now time\.schedule-time\s*\{[^}]*color: var\(--tab-gold\)/, p);
      assert.equal((css.match(/#d4a017/gi) || []).length, 1, `${p}: the tab gold literal appears once`);
    }
  });
});
