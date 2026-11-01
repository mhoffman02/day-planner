/**
 * @file slashKeyAction.test.js
 * @description resolveSlashKeyAction: "/" focuses the Master Tasks filter box on that view, else opens search.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSlashKeyAction } from '../src/searchEngine.js';

const base = { view: 'daily', activeTag: 'BODY', isContentEditable: false, key: '/', ctrl: false, meta: false, alt: false };

describe('resolveSlashKeyAction', () => {
  it('focuses the Master filter on master-tasks', () => {
    assert.equal(resolveSlashKeyAction({ ...base, view: 'master-tasks' }), 'focus-master-filter');
  });
  it('opens search on other views', () => {
    assert.equal(resolveSlashKeyAction(base), 'open-search');
    assert.equal(resolveSlashKeyAction({ ...base, view: 'future' }), 'open-search');
  });
  it('does nothing while typing in an input, textarea or contenteditable', () => {
    for (const activeTag of ['INPUT', 'TEXTAREA']) {
      assert.equal(resolveSlashKeyAction({ ...base, view: 'master-tasks', activeTag }), null);
    }
    assert.equal(resolveSlashKeyAction({ ...base, isContentEditable: true }), null);
  });
  it('ignores other keys', () => {
    assert.equal(resolveSlashKeyAction({ ...base, key: 'a' }), null);
  });
  it('Ctrl or Meta + slash keeps opening search, even on master-tasks', () => {
    assert.equal(resolveSlashKeyAction({ ...base, view: 'master-tasks', ctrl: true }), 'open-search');
    assert.equal(resolveSlashKeyAction({ ...base, view: 'master-tasks', meta: true }), 'open-search');
  });
  it('Alt + slash keeps today behavior (opens search)', () => {
    assert.equal(resolveSlashKeyAction({ ...base, view: 'master-tasks', alt: true }), 'open-search');
  });
});
