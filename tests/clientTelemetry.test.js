/**
 * @file clientTelemetry.test.js
 * @description Client error telemetry (fail loud after release): uncaught errors, unhandled rejections and
 * console.error calls are forwarded to the server log through logFromClient, at most a few per page load and
 * never the same message twice, so an error loop cannot flood google.script.run. Runs src/clientTelemetry.js
 * and its gas-app/Script.html mirror.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as src from '../src/clientTelemetry.js';
import { loadScriptHtml } from './helpers/plannerHarness.js';

const NAMES = ['createClientTelemetry', 'errorParts', 'consoleParts', 'installClientTelemetry', 'TELEMETRY_MAX_PER_PAGE'];
const { scope: gas } = loadScriptHtml({ exportNames: NAMES });

function fakeWindow() {
  const handlers = {};
  const logged = [];
  return {
    handlers, logged,
    addEventListener: (type, fn) => { handlers[type] = fn; },
    console: { error: (...args) => logged.push(args) },
  };
}

for (const [label, m] of [['src/clientTelemetry.js', src], ['gas-app/Script.html', gas]]) {
  for (const n of NAMES) assert.ok(m[n] !== undefined, `${label} defines ${n}`);

  test(`${label}: report sends level, trimmed message and context; same message twice sends once`, () => {
    const sent = [];
    const t = m.createClientTelemetry((...a) => sent.push(a), () => ({ view: 'daily', build: 790 }));
    assert.equal(t.report('ERROR', 'boom', 'at x'), true);
    assert.equal(t.report('ERROR', 'boom', 'at y'), false);
    assert.equal(t.report('WARN', 'boom', ''), true);
    assert.deepEqual(sent, [
      ['ERROR', 'boom', { stack: 'at x', view: 'daily', build: '790' }],
      ['WARN', 'boom', { stack: '', view: 'daily', build: '790' }],
    ]);
  });

  test(`${label}: at most TELEMETRY_MAX_PER_PAGE reports per page load`, () => {
    const sent = [];
    const t = m.createClientTelemetry((...a) => sent.push(a), () => ({}));
    for (let i = 0; i < m.TELEMETRY_MAX_PER_PAGE + 5; i++) t.report('ERROR', 'e' + i, '');
    assert.equal(sent.length, m.TELEMETRY_MAX_PER_PAGE);
    assert.deepEqual(sent[0][2], { stack: '', view: '', build: '' });
  });

  test(`${label}: long message and stack are cut so one entry cannot fill the server log`, () => {
    const sent = [];
    const t = m.createClientTelemetry((...a) => sent.push(a), () => ({}));
    t.report('ERROR', 'm'.repeat(5000), 's'.repeat(9000));
    assert.equal(sent[0][1].length, 1000);
    assert.equal(sent[0][2].stack.length, 4000);
  });

  test(`${label}: errorParts reads an Error, a string and anything else`, () => {
    const err = new Error('bad');
    assert.deepEqual(m.errorParts(err), { message: 'bad', stack: err.stack });
    assert.deepEqual(m.errorParts('plain'), { message: 'plain', stack: '' });
    assert.deepEqual(m.errorParts({ reason: 1 }), { message: '[object Object]', stack: '' });
    assert.deepEqual(m.errorParts(undefined), { message: 'undefined', stack: '' });
  });

  test(`${label}: consoleParts splits the fail-loud "context newline stack" shape and reads Error args`, () => {
    assert.deepEqual(m.consoleParts(['save failed, retrying\nError: x\n    at f']), { message: 'save failed, retrying', stack: 'Error: x\n    at f' });
    const err = new Error('net');
    assert.deepEqual(m.consoleParts(['load failed', err]), { message: 'load failed net', stack: err.stack });
    assert.deepEqual(m.consoleParts([{ a: 1 }]), { message: '{"a":1}', stack: '' });
  });

  test(`${label}: install forwards uncaught errors, unhandled rejections and console.error, and still prints`, () => {
    const win = fakeWindow();
    const reports = [];
    const original = m.installClientTelemetry(win, { report: (...a) => reports.push(a) });
    const err = new Error('kaput');
    win.handlers.error({ error: err, message: 'ignored' });
    win.handlers.error({ error: null, message: 'Script error.' });
    win.handlers.unhandledrejection({ reason: new Error('rejected') });
    win.console.error('ctx failed\nstack line');
    assert.deepEqual(reports.map((r) => [r[0], r[1]]), [
      ['ERROR', 'Uncaught kaput'],
      ['ERROR', 'Uncaught Script error.'],
      ['ERROR', 'Unhandled rejection rejected'],
      ['ERROR', 'ctx failed'],
    ]);
    assert.equal(reports[0][2], err.stack);
    assert.deepEqual(win.logged, [['ctx failed\nstack line']]);
    original('direct');
    assert.equal(reports.length, 4, 'the returned original console.error is not forwarded');
    assert.deepEqual(win.logged.at(-1), ['direct']);
  });
}
