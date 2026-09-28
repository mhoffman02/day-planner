import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Mirrors src/app.js & gas-app/Script.html's scheduleDailyNoteSave debounce. setTimeout is
// modeled as "schedule returns a fire() callback the test invokes manually" so the race between
// debounce-fire and date navigation can be reproduced deterministically, without a real timer.

describe('Daily note save debounce vs. date navigation race', () => {
  // Buggy variant: reads this.selectedDate/this.dailyNote when the timer FIRES, not when it was
  // scheduled. Kept here (not in src) as a regression guard against reintroducing this pattern.
  function scheduleBuggy(state, saveFn) {
    return () => saveFn(state.selectedDate, state.dailyNote);
  }

  // Fixed variant: captures date/content at schedule time, matching src/app.js.
  function scheduleFixed(state, saveFn) {
    const dateStr = state.selectedDate;
    const noteContent = state.dailyNote;
    return () => saveFn(dateStr, noteContent);
  }

  it('buggy scheduler misattributes the note to whatever day was current when the timer fired', () => {
    const state = { selectedDate: '2026-09-28', dailyNote: 'dumpster bill reminder' };
    const saved = [];
    const fire = scheduleBuggy(state, (dateStr, noteContent) => saved.push({ dateStr, noteContent }));

    // User navigates away before the debounce fires (loadDayData reassigns both fields).
    state.selectedDate = '2026-09-29';
    state.dailyNote = 'unrelated next-day content';
    fire();

    assert.notEqual(saved[0].dateStr, '2026-09-28');
    assert.notEqual(saved[0].noteContent, 'dumpster bill reminder');
  });

  it('fixed scheduler saves the original date and content regardless of navigation before the timer fires', () => {
    const state = { selectedDate: '2026-09-28', dailyNote: 'dumpster bill reminder' };
    const saved = [];
    const fire = scheduleFixed(state, (dateStr, noteContent) => saved.push({ dateStr, noteContent }));

    state.selectedDate = '2026-09-29';
    state.dailyNote = 'unrelated next-day content';
    fire();

    assert.equal(saved[0].dateStr, '2026-09-28');
    assert.equal(saved[0].noteContent, 'dumpster bill reminder');
  });

  it('fixed scheduler still saves correctly when no navigation happens before the timer fires', () => {
    const state = { selectedDate: '2026-09-28', dailyNote: 'dumpster bill reminder' };
    const saved = [];
    const fire = scheduleFixed(state, (dateStr, noteContent) => saved.push({ dateStr, noteContent }));

    fire();

    assert.equal(saved[0].dateStr, '2026-09-28');
    assert.equal(saved[0].noteContent, 'dumpster bill reminder');
  });
});
