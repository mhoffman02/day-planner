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
