import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractInlinePriority } from '../src/taskEngine.js';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

// The parser only honors a priority tag at the START of the new-task text (^#a). Docs that show the
// tag at the end (Call vendor #a) failed UAT T01 on 2026-11-02: the tag stayed in the title.
function priorityExamples(file) {
  const html = read(file);
  const out = [];
  const t01 = html.match(/type <code>([^<]*#[abcABC]\b[^<]*)<\/code> in the new task box/);
  if (t01) out.push(t01[1]);
  const row = html.match(/Sets the task(?:'|’)s priority group[\s\S]*?<td><code>([^<]*)<\/code><\/td>/);
  if (row) out.push(row[1]);
  return out;
}

for (const f of ['gas-app/Tutorial.html', 'gas-app/About.html', 'index.html']) {
  test(`${f}: every documented priority example is accepted by the real parser`, () => {
    const examples = priorityExamples(f);
    assert.ok(examples.length >= (f === 'index.html' ? 2 : 1), `found examples in ${f}: ${JSON.stringify(examples)}`);
    for (const ex of examples) {
      const r = extractInlinePriority(ex, 'C');
      assert.equal(r.priorityGroup, 'A', `example "${ex}" should set group A`);
      assert.doesNotMatch(r.cleanTitle, /#/, `example "${ex}" leaves a tag in the title: "${r.cleanTitle}"`);
    }
  });
}

for (const f of ['gas-app/About.html', 'index.html']) {
  test(`${f}: the tag table says the priority tag goes at the start`, () => {
    assert.match(read(f), /Sets the task(?:'|’)s priority group[^<]*at the start/);
  });
}
