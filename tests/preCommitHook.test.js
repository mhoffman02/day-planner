import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hook = readFileSync(new URL('../.githooks/pre-commit', import.meta.url), 'utf8');

test('pre-commit scans staged changes for secrets with gitleaks', () => {
  assert.match(hook, /gitleaks git --staged/);
});

test('pre-commit blocks when gitleaks is not installed (fail loud, never skip)', () => {
  assert.match(hook, /command -v gitleaks/);
  assert.match(hook, /gitleaks is not installed/);
});
