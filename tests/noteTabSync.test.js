import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NOTE_SYNC_CHANNEL, noteSavedMessage, peerNoteToAdopt } from '../src/noteTabSync.js';

const DAY = '2026-11-14';
const idle = { savedText: 'old', editorText: 'old', unsaved: false };

test('a save from another tab is adopted by a tab with no unsaved edits for that day', () => {
  assert.equal(peerNoteToAdopt(noteSavedMessage('B', DAY, 'new'), 'A', idle), 'new');
});

test('a tab with unsaved edits keeps its baseline, so a real clash still warns', () => {
  assert.equal(peerNoteToAdopt(noteSavedMessage('B', DAY, 'new'), 'A', { ...idle, unsaved: true }), null);
  assert.equal(peerNoteToAdopt(noteSavedMessage('B', DAY, 'new'), 'A', { ...idle, editorText: 'typed' }), null);
});

test('own echoes, unknown days, same text and malformed messages are ignored', () => {
  assert.equal(peerNoteToAdopt(noteSavedMessage('A', DAY, 'new'), 'A', idle), null);
  assert.equal(peerNoteToAdopt(noteSavedMessage('B', DAY, 'old'), 'A', idle), null);
  assert.equal(peerNoteToAdopt(noteSavedMessage('B', DAY, 'new'), 'A', { savedText: undefined, editorText: undefined, unsaved: false }), null);
  assert.equal(peerNoteToAdopt({ type: 'note-saved', tabId: 'B', date: 'today', text: 'x' }, 'A', idle), null);
  assert.equal(peerNoteToAdopt({ type: 'other', tabId: 'B', date: DAY, text: 'x' }, 'A', idle), null);
  assert.equal(peerNoteToAdopt(null, 'A', idle), null);
});

test('app posts each confirmed note save and listens for other tabs', () => {
  assert.equal(NOTE_SYNC_CHANNEL, 'day-planner-note-saves');
  for (const file of ['src/app.js', 'gas-app/Script.html']) {
    const src = fs.readFileSync(file, 'utf8');
    assert.match(src, /this\.postNoteSaved\(dateStr, text\)/, `${file}: onSaved does not share the save`);
    assert.match(src, /this\.setupNoteTabSync\(\)/, `${file}: init does not listen for other tabs`);
  }
});
