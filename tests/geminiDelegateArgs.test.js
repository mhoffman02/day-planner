/**
 * @file tests/geminiDelegateArgs.test.js
 * @description agy argv for gemini-delegate must never auto-approve tools: input content is untrusted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAgyArgs } from '../tools/gemini-delegate.js';

test('buildAgyArgs never passes --dangerously-skip-permissions', () => {
  const args = buildAgyArgs({ prompt: 'summarize', model: 'm', dirs: [] });
  assert.ok(!args.includes('--dangerously-skip-permissions'));
});

test('buildAgyArgs carries model, json output, prompt and each dir', () => {
  const args = buildAgyArgs({ prompt: 'p', model: 'm', dirs: ['/a', '/b'] });
  assert.deepEqual(args, ['--model', 'm', '--output-format', 'json', '--print=p', '--add-dir', '/a', '--add-dir', '/b']);
});
