// Gate for .agents/rules/fail-loud-catch.md: tools/check-catch-logging.js must flag every catch that
// neither rethrows nor console.errors the stack, and pass compliant ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSource, htmlScripts } from '../tools/check-catch-logging.js';

const flagged = (src) => checkSource(src).map((v) => v.reason);

test('bare catch is flagged', () => {
  assert.match(flagged('try { a(); } catch { b(); }')[0], /bare catch/);
});

test('catch that only recovers or logs the message is flagged', () => {
  assert.equal(flagged('try { a(); } catch (e) { x = 1; }').length, 1);
  assert.equal(flagged('try { a(); } catch (e) { console.error(e.message); }').length, 1);
  assert.equal(flagged('try { a(); } catch (e) { console.warn("x", e.stack); }').length, 1);
});

test('logging inside a nested function does not count', () => {
  assert.equal(flagged('try { a(); } catch (e) { setTimeout(function () { console.error(e.stack); }); }').length, 1);
});

test('rethrow, console.error(stack) and approved loggers pass', () => {
  assert.deepEqual(flagged('try { a(); } catch (e) { throw new Error("ctx: " + e.message); }'), []);
  assert.deepEqual(flagged('try { a(); } catch (err) { console.error("ctx", err.stack); x = 1; }'), []);
  assert.deepEqual(flagged('try { a(); } catch (err) { if (c) { console.error("ctx\\n" + err.stack); } }'), []);
  assert.deepEqual(flagged('function f() { try { a(); } catch (err) { return logError("ctx", err); } }'), []);
  assert.deepEqual(flagged('try { a(); } catch (err) { DPQueue.logSafe("ctx", err); }'), []);
});

test('html script blocks are extracted with line offsets and scriptlets blanked', () => {
  const html = '<div>\n</div>\n<script>\nvar x = <?!= 1 ?>;\ntry { a(); } catch { b(); }\n</script>';
  const blocks = htmlScripts(html);
  assert.equal(blocks.length, 1);
  const v = checkSource(blocks[0].body, { lineOffset: blocks[0].lineOffset });
  assert.equal(v.length, 1);
  assert.equal(v[0].line, 5);
});
