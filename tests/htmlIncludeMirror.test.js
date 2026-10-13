/**
 * @file htmlIncludeMirror.test.js
 * @description Root index.html (local preview) carries hand-copied versions of gas-app/About.html and
 * gas-app/Tutorial.html, which GAS pulls in with include(). Guards against the copies drifting, and checks
 * the Tutorial exercise IDs (UAT script IDs) are unique, ordered and wired consistently.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const norm = (s) => s.split('\n').map((l) => l.trim()).filter(Boolean);

for (const name of ['About', 'Tutorial']) {
  test(`index.html contains gas-app/${name}.html verbatim (ignoring indentation)`, () => {
    const inc = norm(read(`gas-app/${name}.html`));
    const page = norm(read('index.html'));
    const at = page.indexOf(inc[0]);
    assert.ok(at >= 0, `${name}: first line not found in index.html`);
    for (let i = 0; i < inc.length; i++) {
      // Several includes share the same first line, so look for a full match at every candidate start.
      if (page[at + i] !== inc[i]) {
        const starts = page.map((l, k) => (l === inc[0] ? k : -1)).filter((k) => k >= 0);
        const full = starts.some((k) => inc.every((l, j) => page[k + j] === l));
        assert.ok(full, `${name}.html line ${i + 1} differs in index.html: ${inc[i].slice(0, 80)}`);
        return;
      }
    }
  });
}

test('GAS Index.html includes Tutorial in its own view, and the About nav button opens it', () => {
  assert.match(read('gas-app/Index.html'), /x-if="activeView === 'tutorial'"[\s\S]{0,200}include\('Tutorial'\)/);
  assert.match(read('gas-app/About.html'), /@click="setView\('tutorial'\)"/);
});

test('Tutorial exercises have unique, ordered IDs that each card uses consistently', () => {
  const html = read('gas-app/Tutorial.html');
  const cards = html.split('<details').slice(1);
  const ids = cards.map((c) => (/data-ex="(T\d\d)"/.exec(c) || [])[1]);
  assert.ok(ids.length >= 10, `expected at least 10 exercises, got ${ids.length}`);
  ids.forEach((id, i) => assert.equal(id, `T${String(i + 1).padStart(2, '0')}`, `exercise ${i + 1} id`));
  cards.forEach((c, i) => {
    const id = ids[i];
    assert.match(c, new RegExp(`x-data="\\{ id: '${id}' \\}"`), `${id}: x-data id`);
    assert.match(c, new RegExp(`data-title="[^"]+"`), `${id}: data-title`);
    assert.match(c, new RegExp(`<span class="tutorial-ex-id">${id}</span>`), `${id}: visible id`);
    assert.match(c, new RegExp(`aria-label="Note for ${id}"`), `${id}: note label`);
    for (const step of ['Do', 'Look in', 'Pass if', 'Clean up']) assert.match(c, new RegExp(`<dt>${step}</dt>`), `${id}: ${step}`);
  });
});

test('Triage Archive/Delete buttons and handlers exist in both hand-synced copies', () => {
  for (const page of ['index.html', 'gas-app/Index.html']) {
    const html = read(page);
    assert.match(html, /@click="archiveTriageEntry\(item\)"[^>]*>.*>archive<\/span>Archive</, `${page}: Archive button with archive icon`);
    assert.match(html, /@click="trashTriageEntry\(item\)"[^>]*>.*>delete<\/span>Delete</, `${page}: Delete button with trash icon`);
  }
  for (const js of ['src/app.js', 'gas-app/Script.html']) {
    const src = read(js);
    assert.match(src, /archiveTriageEntry\(item\) \{\s*return this\.runTriageAction\('Archive', \(\) => this\.bridge\.archiveTriageThread\(item\.threadId, this\.hubModeOpts\(\)\), item\.threadId\)/, `${js}: archive handler`);
    assert.match(src, /trashTriageEntry\(item\) \{\s*return this\.runTriageAction\('Delete', \(\) => this\.bridge\.trashTriageThread\(item\.threadId, this\.hubModeOpts\(\)\), item\.threadId, true\)/, `${js}: delete handler`);
  }
});

test('GAS-included HTML avoids the HtmlService truncation triggers (no // or backticks)', () => {
  for (const name of ['About', 'Tutorial']) {
    const src = read(`gas-app/${name}.html`);
    assert.doesNotMatch(src, /`/, `${name}.html has a backtick`);
    assert.doesNotMatch(src.replace(/https?:\/\//g, ''), /\/\//, `${name}.html has a literal //`);
  }
});
