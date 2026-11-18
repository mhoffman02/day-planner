/**
 * @file hotkeys.test.js
 * @description Gmail-style shortcuts (user 2026-11-18): j/k move a row cursor, e archives, # trashes, Shift+T tasks, m dismisses,
 * o/Enter opens, ? shows the help; Ctrl+Shift+7/8 make numbered and bulleted lists in Notes. Keys never fire while typing,
 * with a dialog open or while held down (except j/k), and # only exists where it can mean Trash.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOTKEYS, HOTKEY_SECTIONS, resolveHotkey, resolveNotesHotkey, stepCursor, cursorAfterRemoval, hotkeySections } from '../src/hotkeys.js';

const key = (k, o = {}) => ({ key: k, code: o.code || '', ctrlKey: !!o.ctrl, metaKey: !!o.meta, altKey: !!o.alt, shiftKey: !!o.shift, repeat: !!o.repeat });
const resolve = (k, view = 'triage', ctx = {}, o = {}) => resolveHotkey(key(k, o), { view, ...ctx });

test('Triage keys resolve to the Gmail actions', () => {
  assert.equal(resolve('j'), 'cursor-next');
  assert.equal(resolve('k'), 'cursor-prev');
  assert.equal(resolve('e'), 'triage-archive');
  assert.equal(resolve('#', 'triage', {}, { shift: true }), 'trash');
  assert.equal(resolve('T', 'triage', {}, { shift: true }), 'triage-task-today');
  assert.equal(resolve('m'), 'triage-dismiss');
  assert.equal(resolve('o'), 'open');
  assert.equal(resolve('Enter'), 'open');
  assert.equal(resolve('?', 'triage', {}, { shift: true }), 'help');
});

test('plain t is not Task Today (it stays Jump to Today); only Shift+T is', () => {
  assert.equal(resolve('t'), null);
  assert.equal(resolve('T', 'triage', {}, { shift: true }), 'triage-task-today');
  assert.equal(resolve('T', 'triage'), null, 'a capital T without Shift held is not the chord');
});

test('Triage-only keys are dead on other tabs', () => {
  for (const view of ['daily', 'master-tasks', 'monthly-calendar']) {
    for (const [k, o] of [['e', {}], ['m', {}], ['o', {}], ['Enter', {}], ['T', { shift: true }]]) {
      assert.equal(resolve(k, view, {}, o), null, `${k} on ${view}`);
    }
  }
});

test('# is Trash on Triage, Today and Master Tasks, and nowhere else', () => {
  for (const view of ['triage', 'daily', 'master-tasks']) assert.equal(resolve('#', view, {}, { shift: true }), 'trash', view);
  for (const view of ['monthly-calendar', 'weekly', 'notes', 'goals']) assert.equal(resolve('#', view, {}, { shift: true }), null, view);
});

test('j and k move the cursor on the three row tabs only', () => {
  for (const view of ['triage', 'daily', 'master-tasks']) {
    assert.equal(resolve('j', view), 'cursor-next', view);
    assert.equal(resolve('k', view), 'cursor-prev', view);
  }
  assert.equal(resolve('j', 'monthly-calendar'), null);
});

test('nothing fires while typing, composing, or after another handler claimed the key', () => {
  assert.equal(resolve('e', 'triage', { typing: true }), null);
  assert.equal(resolve('#', 'daily', { typing: true }, { shift: true }), null);
  assert.equal(resolveHotkey({ ...key('e'), isComposing: true }, { view: 'triage' }), null);
  assert.equal(resolveHotkey({ ...key('e'), defaultPrevented: true }, { view: 'triage' }), null);
});

test('a modifier chord is never a bare shortcut (Ctrl+E, Alt+J, Cmd+K keep their other meanings)', () => {
  assert.equal(resolve('e', 'triage', {}, { ctrl: true }), null);
  assert.equal(resolve('e', 'triage', {}, { meta: true }), null);
  assert.equal(resolve('j', 'triage', {}, { alt: true }), null);
  assert.equal(resolve('#', 'daily', {}, { ctrl: true, shift: true }), null);
});

test('with a dialog or menu open only the help toggle works', () => {
  assert.equal(resolve('e', 'triage', { modalOpen: true }), null);
  assert.equal(resolve('j', 'daily', { modalOpen: true }), null);
  assert.equal(resolve('?', 'triage', { modalOpen: true }, { shift: true }), null, 'help does not open over another dialog');
});

test('with the help overlay open, ? closes it and row keys are inert', () => {
  const ctx = { modalOpen: true, helpOpen: true };
  assert.equal(resolve('?', 'triage', ctx, { shift: true }), 'help');
  for (const k of ['e', 'j', 'm', 'o']) assert.equal(resolve(k, 'triage', ctx), null, k);
  assert.equal(resolve('#', 'daily', ctx, { shift: true }), null);
});

test('a held key repeats only for j and k; a held e or # never archives or deletes a second row', () => {
  assert.equal(resolve('j', 'triage', {}, { repeat: true }), 'cursor-next');
  assert.equal(resolve('k', 'triage', {}, { repeat: true }), 'cursor-prev');
  assert.equal(resolve('e', 'triage', {}, { repeat: true }), null);
  assert.equal(resolve('#', 'daily', {}, { repeat: true, shift: true }), null);
  assert.equal(resolve('m', 'triage', {}, { repeat: true }), null);
});

test('Enter opens the row only when no button or link has focus (those keep their own Enter)', () => {
  assert.equal(resolve('Enter', 'triage', { onControl: true }), null);
  assert.equal(resolve('o', 'triage', { onControl: true }), 'open');
});

test('Notes list keys match the physical digit, with Ctrl or Cmd plus Shift', () => {
  assert.equal(resolveNotesHotkey(key('*', { code: 'Digit8', ctrl: true, shift: true })), 'notes-bullets');
  assert.equal(resolveNotesHotkey(key('&', { code: 'Digit7', meta: true, shift: true })), 'notes-numbers');
  assert.equal(resolveNotesHotkey(key('8', { code: 'Digit8', ctrl: true })), null, 'Shift is required');
  assert.equal(resolveNotesHotkey(key('*', { code: 'Digit8', shift: true })), null, 'Ctrl is required');
  assert.equal(resolveNotesHotkey(key('*', { code: 'Digit8', ctrl: true, shift: true, alt: true })), null);
  assert.equal(resolveNotesHotkey(key('c', { code: 'KeyC', ctrl: true, shift: true })), null);
});

test('window dispatch never claims a Notes key, and Notes dispatch never claims a window key', () => {
  assert.equal(resolve('*', 'daily', {}, { code: 'Digit8', ctrl: true, shift: true }), null);
  assert.equal(resolveNotesHotkey(key('e')), null);
});

test('stepCursor: first row when there is no cursor, clamps at both ends, empty list gives nothing', () => {
  const ids = ['a', 'b', 'c'];
  assert.equal(stepCursor(ids, '', 1), 'a');
  assert.equal(stepCursor(ids, '', -1), 'a');
  assert.equal(stepCursor(ids, 'gone', 1), 'a');
  assert.equal(stepCursor(ids, 'a', 1), 'b');
  assert.equal(stepCursor(ids, 'c', 1), 'c');
  assert.equal(stepCursor(ids, 'a', -1), 'a');
  assert.equal(stepCursor([], 'a', 1), '');
  assert.equal(stepCursor(['only'], 'only', 1), 'only');
});

test('cursorAfterRemoval: the next row, else the previous, else nothing', () => {
  assert.equal(cursorAfterRemoval(['a', 'b', 'c'], 'a'), 'b');
  assert.equal(cursorAfterRemoval(['a', 'b', 'c'], 'b'), 'c');
  assert.equal(cursorAfterRemoval(['a', 'b', 'c'], 'c'), 'b');
  assert.equal(cursorAfterRemoval(['a'], 'a'), '');
  assert.equal(cursorAfterRemoval(['a', 'b'], 'zzz'), '');
});

test('the table has unique ids, known sections, and no two window keys share a view and key', () => {
  const ids = HOTKEYS.map((h) => h.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const h of HOTKEYS) assert.ok(HOTKEY_SECTIONS.includes(h.section), `${h.id} section ${h.section}`);
  const seen = new Map();
  for (const h of HOTKEYS.filter((x) => x.scope === 'window')) {
    for (const view of h.views || ['*']) {
      for (const c of h.combos) {
        const k = `${view}|${c.key}|${c.shift}`;
        assert.ok(!seen.has(k), `${h.id} collides with ${seen.get(k)} on ${view} ${c.key}`);
        seen.set(k, h.id);
      }
    }
  }
});

test('the help overlay lists every shortcut in the table, grouped by section', () => {
  const sections = hotkeySections();
  assert.deepEqual(sections.map((s) => s.section), ['Navigation', 'Triage', 'Notes', 'Application']);
  const text = JSON.stringify(sections);
  for (const label of ['j', 'k', 'o or Enter', 'e', '#', 'Shift + t', 'm', 'Ctrl + Shift + 8', 'Ctrl + Shift + 7', '?']) {
    assert.ok(text.includes(JSON.stringify(label).slice(1, -1)), `help is missing ${label}`);
  }
  assert.equal(sections.flatMap((s) => s.rows).length, HOTKEYS.length);
});
