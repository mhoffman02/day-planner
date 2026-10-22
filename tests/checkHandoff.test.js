// Gate for the handoff skill's Step 5.2: tools/check-handoff.js does the mechanical checks on HANDOFF.md and the
// tracker docs (overdue open items, dead pointers, stale stamp, open sections left out, secrets).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { overdueItems, missingPointers, stampProblems, uncoveredSections, secretHits } from '../tools/check-handoff.js';

test('open items with a due date before today are overdue; closed, future, undated and marked ones are not', () => {
  const md = [
    '- [ ] **Watch the expiry** due 2026-10-17: rerun the login.',
    '- [ ] **Probe** rerun the rpc login on',
    '  2026-10-01 and check the web app.',
    '- [x] **Done thing** due 2026-01-01.',
    '- [ ] **Later** due 2026-12-01.',
    '- [ ] **Noted** (2026-10-16): added that day, no deadline.',
    '- [ ] **OVERDUE (was due 2026-10-17)**: already flagged.'
  ].join('\n');
  const hits = overdueItems(md, '2026-10-22');
  assert.deepEqual(hits.map((h) => [h.line, h.date]), [[1, '2026-10-17'], [2, '2026-10-01']]);
});

test('pointers to missing files or past-the-end lines are reported; real ones pass', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'app.js'), 'a\nb\nc\n');
  fs.writeFileSync(path.join(root, 'TODO.md'), 'x\n');
  const main = '/home/u/projects/demo';
  const md = [
    'See `src/app.js` and [`src/app.js:2`](file:///home/u/projects/demo/src/app.js#L2) and `TODO.md`.',
    'Gone: `src/gone.js`, past end: `src/app.js:99`, link [x](file:///home/u/projects/demo/src/app.js#L50).',
    'Not paths: `npm run rpc -- runSelfTest`, `<HOME id>`, `https://example.com/a.js`.'
  ].join('\n');
  const probs = missingPointers(md, { root, mainCheckout: main }).map((p) => `${p.line}:${p.pointer}`);
  assert.deepEqual(probs, ['2:src/gone.js', '2:src/app.js:99', '2:src/app.js#L50']);
});

test('stamp must exist and its base must be HEAD (before commit) or HEAD^ when HEAD is the handoff commit', () => {
  const md = '<!-- handoff: branch=b worktree=/w base=abc123def456 written=2026-10-22T08:00:00-07:00 -->\n# Resume';
  assert.deepEqual(stampProblems(md, { head: 'abc123def4567890', headParent: '999', headTouchesHandoff: false }), []);
  assert.deepEqual(stampProblems(md, { head: 'fff', headParent: 'abc123def4567890', headTouchesHandoff: true }), []);
  assert.match(stampProblems(md, { head: 'fff', headParent: 'abc123def4567890', headTouchesHandoff: false })[0], /base/);
  assert.match(stampProblems('# Resume', { head: 'a', headParent: 'b', headTouchesHandoff: false })[0], /no stamp/);
});

test('every TODO section with open items is mentioned in the handoff (by Phase number or heading)', () => {
  const todo = [
    '## Phase 31: Search polish', '- [ ] a',
    '## Phase 30: WORK promotion', '- [ ] b',
    '## Ideas', '- [ ] c',
    '## Phase 29: Done', '- [x] d'
  ].join('\n');
  assert.deepEqual(uncoveredSections(todo, 'Still open, Phase 31 ... then phase 30 agent work.'), ['Ideas']);
});

test('secrets are reported by kind and line, never echoed', () => {
  const md = [
    'deployment AKfycbzZW7LNOkWUhz_SQd4Ka2LCKvT9zwajFGGAHmDXtpG_W0YR28mPFEKwbtDLWyX13xn7YA is public',
    'token ghp_' + 'a'.repeat(36),
    '-----BEGIN PRIVATE KEY-----',
    '"refresh_token": "1//0abcdefghijklmnopqrstuvwxyz"'
  ].join('\n');
  const hits = secretHits(md);
  assert.deepEqual(hits.map((h) => h.line), [2, 3, 4]);
  assert.ok(hits.every((h) => !JSON.stringify(h).includes('aaaa')), 'secret text is not echoed');
});
