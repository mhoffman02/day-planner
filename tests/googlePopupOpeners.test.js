/**
 * @file googlePopupOpeners.test.js
 * @description Every Gmail and Google Calendar opener opens a centered popup window, never a tab (user 2026-11-18: the
 * installed app has no tabs, so a tab strands the user). The anchors keep a real href for copy-link and a click handler
 * that cancels the navigation and calls openGmailWindow or openGCalWindow. A sweep over both Index copies fails when a
 * new Gmail or Calendar anchor is added without the handler. The window itself cannot be opened from the node harness,
 * so sizing lives in popupWindowFeatures (tests/attendeeActions.test.js) and the failure paths are checked here.
 */
import { describe, it, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bothClients, makeVm } from './helpers/plannerHarness.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const clients = await bothClients();

for (const c of clients) {
  describe(`google popup openers [${c.label}]`, () => {
    it('openGmailWindow and openGooglePopup exist', () => {
      const v = makeVm(c.factory, {});
      assert.equal(typeof v.openGmailWindow, 'function');
      assert.equal(typeof v.openGooglePopup, 'function');
    });

    it('a missing link is reported loudly (console.error with a stack plus a toast), not silently ignored', () => {
      const v = makeVm(c.factory, {});
      const toasts = [];
      v.showTaskToast = (msg) => toasts.push(msg);
      const err = mock.method(console, 'error', () => {});
      try {
        v.openGmailWindow('');
      } finally {
        const logged = err.mock.calls.map((call) => String(call.arguments[0]));
        err.mock.restore();
        assert.ok(logged.some((m) => m.includes('Open Gmail') && m.includes('no link')), 'console.error names the opener');
      }
      assert.equal(toasts.length, 1);
      assert.match(toasts[0], /Gmail/);
    });
  });
}

for (const file of ['index.html', 'gas-app/Index.html']) {
  const html = read(file);
  const anchors = html.match(/<a\s[^>]*>/g) || [];

  test(`${file}: every Gmail or Calendar anchor opens a popup window through a click handler`, () => {
    const openers = anchors.filter((a) => /emailGuestsUrl|gmailUrl|eventGCalLink|gCalLink|Open Gmail:/.test(a));
    assert.ok(openers.length >= 6, 'found the Appointments mail and Calendar icons, the popup button, the Email card, Triage and carry-in links');
    for (const a of openers) {
      assert.match(a, /@click(\.[a-z]+)*\.prevent(\.[a-z]+)*="open(Gmail|GCal)Window\(/, a.slice(0, 120));
    }
  });

  test(`${file}: the specific openers named by the user call the right window`, () => {
    assert.match(html, /:href="emailGuestsUrl\(evt\)"[^>]*@click\.stop\.prevent="openGmailWindow\(emailGuestsUrl\(evt\)\)"/);
    assert.match(html, /<a :href="n\.gmailUrl"[^>]*@click\.prevent="openGmailWindow\(n\.gmailUrl\)"/);
    assert.match(html, /:href="item\.url"[^>]*@click\.prevent="openGmailWindow\(item\.url\)"[^>]*Open the thread in Gmail/);
    assert.match(html, /:href="c\.gmailUrl"[^>]*@click\.prevent="openGmailWindow\(c\.gmailUrl\)"/);
    assert.match(html, /:href="selectedEvent\?\.gCalLink"[^>]*@click\.prevent="openGCalWindow\(selectedEvent\)"/);
  });
}

for (const file of ['src/app.js', 'gas-app/Script.html']) {
  test(`${file}: the native Calendar create window is centered too, through the same helper`, () => {
    const code = read(file);
    assert.match(code, /openGooglePopup\(gCalUrl, 'gCalNativeNewAppt', 'Google Calendar', 750, 680\)/);
    assert.doesNotMatch(code, /window\.open\(gCalUrl/);
  });

  test(`${file}: only openGooglePopup calls window.open for Gmail and Calendar`, () => {
    const code = read(file);
    assert.doesNotMatch(code, /window\.open\([^)]*(emailGuestsUrl|gmailUrl|eventGCalLink)/);
  });
}
