// Regression: the manifest has no userinfo.email scope, so Session.getActiveUser() throws (seen live on
// HOME 2026-10-09). Code.gs folder-owner checks used it and, on that throw, bound ANY "Day Planner"
// folder (auto-search) or accepted a read-only folder (validateAndSaveFolderUrl). Ownership now comes
// from Drive v2 userPermission/editable via driveFolderAccess_, failing closed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const gasDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'gas-app');
const codeGs = fs.readFileSync(path.join(gasDir, 'Code.gs'), 'utf8');

function loadHelper(filesGet) {
  const start = codeGs.indexOf('function driveFolderAccess_(');
  assert.ok(start > 0, 'driveFolderAccess_ not found in Code.gs');
  const end = codeGs.indexOf('\n}\n', start) + 3;
  const ctx = { Drive: { Files: { get: filesGet } } };
  vm.runInNewContext(codeGs.slice(start, end) + '\nthis.driveFolderAccess_ = driveFolderAccess_;', ctx);
  return ctx.driveFolderAccess_;
}

test('owner role => owner and writable', () => {
  const f = loadHelper(() => ({ editable: true, userPermission: { role: 'owner' } }));
  assert.deepEqual({ ...f('F1') }, { owner: true, writable: true });
});

test('writer role => writable, not owner', () => {
  const f = loadHelper(() => ({ editable: true, userPermission: { role: 'writer' } }));
  assert.deepEqual({ ...f('F1') }, { owner: false, writable: true });
});

test('reader role => neither', () => {
  const f = loadHelper(() => ({ editable: false, userPermission: { role: 'reader' } }));
  assert.deepEqual({ ...f('F1') }, { owner: false, writable: false });
});

test('Drive failure throws (callers fail closed), never assumes access', () => {
  const f = loadHelper(() => { throw new Error('403'); });
  assert.throws(() => f('F1'), /403/);
});

test('no gas-app .gs file calls Session.getActiveUser/getEffectiveUser (no userinfo.email scope)', () => {
  for (const file of fs.readdirSync(gasDir).filter((n) => n.endsWith('.gs'))) {
    const src = fs.readFileSync(path.join(gasDir, file), 'utf8');
    assert.doesNotMatch(src, /Session\.get(Active|Effective)User\(/, `${file} calls a Session user lookup`);
  }
});
