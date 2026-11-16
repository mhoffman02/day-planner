/**
 * @file logFromClient.test.js
 * @description Server half of client error telemetry: the logFromClient RPC (top-level delegator, v_ guarded)
 * writes a client entry into the server log ring buffer with view and build in its context, and refuses
 * anything outside the shape src/clientTelemetry.js sends. Runs the REAL gas-app/Code.gs in a vm.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeGasContext, loadGasFile } from './helpers/gasRuntimeStubs.js';

function ctxWithLog() {
  const ctx = makeGasContext();
  ctx.console.info = ctx.console.log;
  loadGasFile(ctx, 'Code.gs');
  const ring = () => JSON.parse(ctx.PropertiesService.getUserProperties().getProperty('RECENT_SERVER_LOGS') || '[]');
  return { ctx, ring };
}

test('logFromClient is a top-level google.script.run delegator with an IIFE alias', () => {
  const code = fs.readFileSync(new URL('../gas-app/Code.gs', import.meta.url), 'utf8');
  assert.match(code, /\nfunction logFromClient\(level, message, data\) \{/);
  assert.match(code, /global\._logFromClientInternal = recordClientLog;/);
});

test('logFromClient records a client entry with view and build in the context', () => {
  const { ctx, ring } = ctxWithLog();
  assert.equal(ctx.logFromClient('ERROR', 'Uncaught boom', { stack: 'Error: boom\n    at f', view: 'daily', build: '790' }), true);
  const [entry] = ring();
  assert.equal(entry.level, 'ERROR');
  assert.equal(entry.context, 'client daily build 790');
  assert.equal(entry.message, 'Uncaught boom');
  assert.equal(entry.stack, 'Error: boom\n    at f');
});

test('logFromClient with no view, build or stack still records', () => {
  const { ctx, ring } = ctxWithLog();
  ctx.logFromClient('WARN', 'slow', { stack: '', view: '', build: '' });
  const [entry] = ring();
  assert.equal(entry.level, 'WARN');
  assert.equal(entry.context, 'client');
  assert.equal(entry.stack, null);
});

test('logFromClient refuses a bad level, a non-string message, an oversized message or a non-object data', () => {
  const { ctx, ring } = ctxWithLog();
  const data = { stack: '', view: '', build: '' };
  assert.throws(() => ctx.logFromClient('DEBUG', 'x', data), /level/);
  assert.throws(() => ctx.logFromClient('ERROR', 42, data), /message/);
  assert.throws(() => ctx.logFromClient('ERROR', 'm'.repeat(1001), data), /message/);
  assert.throws(() => ctx.logFromClient('ERROR', 'x', 'nope'), /data/);
  assert.equal(ring().length, 0);
});
