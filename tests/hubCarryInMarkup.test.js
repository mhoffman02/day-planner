import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HubMock } from '../src/hubMock.js';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

for (const f of ['index.html', 'gas-app/Index.html']) {
  test(`${f}: Meeting Prep carry-ins are a collapsible details section of collapsible details items`, () => {
    const html = read(f);
    assert.doesNotMatch(html, /listed in the meeting notes Doc/);
    // Section: native details, open for 1-5 carry-ins, collapsed above 5 (and when empty).
    assert.match(html, /<details class="hub-carryins"[^>]*:open="meetingPrep\.carryInCount > 0 &amp;&amp; meetingPrep\.carryInCount &lt;= 5"/);
    assert.match(html, /<summary class="hub-carryins-summary"><span class="hub-queue-title" id="hubCarryInsTitle" x-text="'Carry-ins \(' \+ meetingPrep\.carryInCount \+ '\)'"/);
    // Items: collapsed by default (no open attribute), subject link in the summary, details in the body.
    const item = html.match(/<details class="hub-carryin-item">[\s\S]*?<\/details>/);
    assert.ok(item, 'item details exists with no open attribute');
    assert.match(item[0], /<summary[^>]*>.*<a class="hub-subject" :href="c\.gmailUrl" target="_blank" rel="noopener noreferrer"/);
    assert.match(item[0], /c\.fromName/);
    assert.match(item[0], /c\.receivedDate/);
    ['c.framing', 'c.snippet', 'c.kind'].forEach((k) => assert.ok(item[0].includes(`x-text="${k}"`), k));
    // The copy box and button live inside the section.
    const section = html.match(/<details class="hub-carryins"[\s\S]*?<\/details>\s*<\/article>/);
    assert.ok(section, 'section closes right before the article');
    assert.match(section[0], /<textarea id="hubCarryInText" class="hub-carryin-text" readonly/);
    assert.match(section[0], /@click="copyCarryIns\(\)">Copy<\/button>/);
  });
}

for (const f of ['index.html', 'gas-app/About.html']) {
  test(`${f}: About says carry-ins are a copy-ready list and links the Drive re-grant page`, () => {
    const html = read(f);
    assert.match(html, /copy-ready bullet list with a link to each email\. The notes Doc is not written\./);
    assert.match(html, /<a :href="regrantUrl" target="_blank" rel="noopener noreferrer">Drive re-grant page<\/a>/);
    assert.match(html, /this\.regrantUrl = r\.regrantUrl \|\| null;/);
    assert.match(html, /Notes Doc is inaccessible/);
  });
}

for (const f of ['index.html', 'gas-app/Tutorial.html']) {
  test(`${f}: Tutorial Before you start links the Hub Config Sheet like About and loads its own searchUrl`, () => {
    const html = read(f);
    assert.match(html, /Change these settings in the <a x-show="hubLink\.searchUrl" :href="hubLink\.searchUrl" target="_blank" rel="noopener noreferrer" title="Find it in Google Drive \(you should see exactly one\)">Hub Config Sheet<\/a><i x-show="!hubLink\.searchUrl">Hub Config Sheet<\/i>/);
    // hubLink is About-local, so the Tutorial x-data must define and load it itself.
    assert.match(html, /hubLink: \{ searchUrl: null \}/);
    assert.match(html, /bridge\.getHubSheetLink\(\)/);
  });
}

test('mock getHubSheetLink always supplies a searchUrl so the Tutorial link renders in local preview', () => {
  assert.match(new HubMock().getHubSheetLink().searchUrl, /^https:/);
});

test('HubMock returns the carry-in list, the copy text and the re-grant URL like the real server', () => {
  const mock = new HubMock();
  const prep = mock.getMeetingPrep('NCMMS_CORE', null);
  assert.equal(prep.carryInCount, prep.carryIns.length);
  assert.ok(prep.carryIns.length > 0);
  assert.equal(prep.carryInsText.split('\n').length, prep.carryIns.length);
  assert.ok(!('threadId' in prep.carryIns[0]));
  assert.match(mock.getHubSheetLink().regrantUrl, /\?view=regrant$/);
});
