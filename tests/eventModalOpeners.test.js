/**
 * @file eventModalOpeners.test.js
 * @description User 2026-11-13: Edit and Delete in the appointment popup did nothing. Each opens a sibling
 * dialog whose @click.away fires on the same click and closes it at once; .stop keeps the click from
 * reaching the document-level click.away listeners.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../gas-app/Index.html', import.meta.url), 'utf8');

describe('appointment popup Edit/Delete buttons', () => {
  for (const fn of ['openEditEventModal(selectedEvent)', 'requestDeleteEvent(selectedEvent)']) {
    it(`${fn} stops propagation so the dialog it opens is not click-away closed`, () => {
      assert.ok(html.includes(`@click.stop="${fn}"`), `${fn} button needs @click.stop`);
    });
  }
});

// User 2026-11-13: clicking a free time slot (or its time label) to add an appointment did nothing; the
// create dialog opened and its @click.away closed it on the same real click. Both pages carry the slots.
describe('schedule slot create openers', () => {
  const pages = { 'gas-app/Index.html': html, 'index.html': fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8') };
  for (const [name, text] of Object.entries(pages)) {
    for (const fn of ['openCreateEventModal(slot.timeKey)"', 'slot.events.length === 0 && openCreateEventModal(slot.timeKey)"']) {
      it(`${name}: @click.stop on ${fn}`, () => {
        assert.ok(text.includes(`@click.stop="${fn}`), `${name} slot handler needs @click.stop`);
      });
    }
  }
});
