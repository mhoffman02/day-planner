import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

// The Meeting Prep mail status line sits under the header inside a column flex container. The
// header-row class hub-header-meta has flex-grow 1, which stretched the line to half the screen.
for (const f of ['index.html', 'gas-app/Index.html']) {
  test(`${f}: the Meeting Prep mail note uses its own non-growing class`, () => {
    const p = read(f).match(/<p class="([^"]*)"[^>]*x-text="meetingPrepMailNote"/);
    assert.ok(p, 'mail note paragraph exists');
    assert.ok(p[1].split(' ').includes('hub-mail-note'), `class list: ${p[1]}`);
    assert.ok(!p[1].split(' ').includes('hub-header-meta'), 'must not reuse the growing header-row class');
  });
}

for (const f of ['src/styles.css', 'gas-app/Styles.html']) {
  test(`${f}: .hub-mail-note does not grow`, () => {
    const rule = read(f).match(/\.hub-mail-note\s*\{([^}]*)\}/);
    assert.ok(rule, '.hub-mail-note rule exists');
    assert.match(rule[1], /flex:\s*none|flex:\s*0 0 auto/);
  });
}

for (const f of ['src/app.js', 'gas-app/Script.html']) {
  test(`${f}: clockText shows the browser local clock, not UTC`, () => {
    const body = read(f).match(/clockText\(ms\) \{([\s\S]*?)\n      \},/);
    assert.ok(body, 'clockText exists');
    assert.match(body[1], /getHours\(\)/);
    assert.match(body[1], /getMinutes\(\)/);
    assert.doesNotMatch(body[1], /UTC|toISOString/);
  });
}
