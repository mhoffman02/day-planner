/**
 * @file tests/gasRpc.test.js
 * @description Unit tests for tools/gas-rpc.js (Apps Script Execution API CLI) using fake fetch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadClaspCredentials,
  readScriptId,
  refreshAccessToken,
  buildRunRequest,
  runFunction,
  interpretRunResponse,
  main,
  checkTokenAge,
  API_DEPLOYMENT_ID
} from '../tools/gas-rpc.js';

const SECRET_TOKEN = 'rt-SUPER-SECRET-VALUE';

function tmpFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gasrpc-'));
  const p = path.join(dir, name);
  if (content !== undefined) fs.writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content));
  return p;
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('loadClaspCredentials: clasp 3.x shape', () => {
  const p = tmpFile('rc.json', { tokens: { default: { client_id: 'cid', client_secret: 'cs', refresh_token: SECRET_TOKEN } } });
  assert.deepEqual(loadClaspCredentials(p, {}), { clientId: 'cid', clientSecret: 'cs', refreshToken: SECRET_TOKEN });
});

test('loadClaspCredentials: clasp 3.x named user', () => {
  const p = tmpFile('rc.json', { tokens: { bob: { client_id: 'b', client_secret: 'bs', refresh_token: 'br' } } });
  assert.equal(loadClaspCredentials(p, { GAS_RPC_CLASP_USER: 'bob' }).clientId, 'b');
});

test('loadClaspCredentials: prefers the `rpc` slot over the `default` push login', () => {
  const p = tmpFile('rc.json', { tokens: {
    default: { client_id: 'push', client_secret: 'ps', refresh_token: 'pr' },
    rpc: { client_id: 'proj', client_secret: 'js', refresh_token: 'jr' }
  } });
  assert.equal(loadClaspCredentials(p, {}).clientId, 'proj');
});

test('loadClaspCredentials: legacy shape', () => {
  const p = tmpFile('rc.json', {
    token: { refresh_token: SECRET_TOKEN },
    oauth2ClientSettings: { clientId: 'cid2', clientSecret: 'cs2' }
  });
  assert.deepEqual(loadClaspCredentials(p, {}), { clientId: 'cid2', clientSecret: 'cs2', refreshToken: SECRET_TOKEN });
});

test('loadClaspCredentials: missing file error is actionable', () => {
  const p = path.join(os.tmpdir(), 'gasrpc-does-not-exist', 'rc.json');
  assert.throws(() => loadClaspCredentials(p, {}), /clasp login --user rpc --creds/);
});

test('loadClaspCredentials: missing fields error never leaks token', () => {
  const p = tmpFile('rc.json', { tokens: { default: { refresh_token: SECRET_TOKEN } } });
  try {
    loadClaspCredentials(p, {});
    assert.fail('should throw');
  } catch (err) {
    assert.match(err.message, /clasp login --user rpc --creds/);
    assert.ok(!err.message.includes(SECRET_TOKEN));
  }
});

test('readScriptId reads the real HOME script id', () => {
  assert.equal(readScriptId(), '1XUrbUS55yQf_UDuNRou3WVn62SFQ2Qsdr9ITjO7Z3FisDVVhW58ksj-W');
});

test('readScriptId throws when scriptId missing', () => {
  const p = tmpFile('.clasp.json', {});
  assert.throws(() => readScriptId(p), /scriptId/);
});

test('buildRunRequest validates function name', () => {
  assert.throws(() => buildRunRequest('foo;bar', [], true), /function/i);
  assert.throws(() => buildRunRequest('', [], true), /function/i);
  assert.deepEqual(buildRunRequest('runAll', [1], true), { function: 'runAll', parameters: [1], devMode: true });
});

test('refreshAccessToken success', async () => {
  let seen;
  const fetchImpl = async (url, opts) => {
    seen = { url, opts };
    return jsonResponse(200, { access_token: 'at-123' });
  };
  const at = await refreshAccessToken({ clientId: 'c', clientSecret: 's', refreshToken: 'r' }, fetchImpl);
  assert.equal(at, 'at-123');
  assert.equal(seen.url, 'https://oauth2.googleapis.com/token');
  assert.equal(seen.opts.method, 'POST');
  assert.match(String(seen.opts.body), /grant_type=refresh_token/);
});

test('refreshAccessToken invalid_grant throws without token', async () => {
  const fetchImpl = async () => jsonResponse(400, { error: 'invalid_grant', error_description: 'Bad' });
  await assert.rejects(
    () => refreshAccessToken({ clientId: 'c', clientSecret: 's', refreshToken: SECRET_TOKEN }, fetchImpl),
    (err) => /invalid_grant/.test(err.message) && /400/.test(err.message) && !err.message.includes(SECRET_TOKEN)
  );
});

test('runFunction sends correct request', async () => {
  let seen;
  const fetchImpl = async (url, opts) => {
    seen = { url, opts };
    return jsonResponse(200, { response: { result: 1 } });
  };
  const body = { function: 'f', parameters: [], devMode: true };
  const out = await runFunction({ runId: 'SID', accessToken: 'tok', body, fetchImpl });
  assert.equal(seen.url, 'https://script.googleapis.com/v1/scripts/SID:run');
  assert.equal(seen.opts.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(seen.opts.body), body);
  assert.equal(out.httpStatus, 200);
  assert.equal(out.response.result, 1);
});

test('interpretRunResponse: http 403 hint', () => {
  const r = interpretRunResponse({ httpStatus: 403, error: { message: 'denied', status: 'PERMISSION_DENIED' } });
  assert.equal(r.ok, false);
  assert.equal(r.error.kind, 'http');
  assert.equal(r.error.status, 403);
  assert.match(r.error.hint, /executionApi/);
});

test('interpretRunResponse: script error with stack', () => {
  const r = interpretRunResponse({
    httpStatus: 200,
    done: true,
    error: {
      message: 'ScriptError',
      details: [{ errorMessage: 'boom', errorType: 'TypeError', scriptStackTraceElements: [{ function: 'f', lineNumber: 3 }] }]
    }
  });
  assert.equal(r.ok, false);
  assert.equal(r.error.kind, 'script');
  assert.equal(r.error.message, 'boom');
  assert.equal(r.error.errorType, 'TypeError');
  assert.deepEqual(r.error.stack, [{ function: 'f', lineNumber: 3 }]);
});

test('interpretRunResponse: result heuristics', () => {
  const wrap = (result) => ({ httpStatus: 200, response: { result } });
  assert.equal(interpretRunResponse(wrap({ passedCount: 7, totalTests: 7 })).ok, true);
  assert.equal(interpretRunResponse(wrap({ passedCount: 6, totalTests: 7 })).ok, false);
  assert.equal(interpretRunResponse(wrap({ overallStatus: 'UNHEALTHY' })).ok, false);
  assert.equal(interpretRunResponse(wrap([{ status: 'PASS' }, { status: 'FAIL' }])).ok, false);
  assert.equal(interpretRunResponse(wrap({ ok: false, status: 'DONE', message: '0 processed, 3 errors' })).ok, false, 'makeResult ok:false is a failure');
  assert.equal(interpretRunResponse(wrap({ ok: true, status: 'DONE', message: '3 processed' })).ok, true);
  const plain = interpretRunResponse(wrap('hello'));
  assert.equal(plain.ok, true);
  assert.equal(plain.result, 'hello');
});

function makeEnv() {
  const rc = tmpFile('rc.json', { tokens: { default: { client_id: 'c', client_secret: 's', refresh_token: SECRET_TOKEN } } });
  return { GAS_RPC_CLASPRC: rc, GAS_RPC_STATE: tmpFile('state.json') };
}

function makeIo() {
  const out = [];
  const err = [];
  return { out, err, stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) } };
}

function fakeFetch(runStatus, runBody) {
  return async (url) => {
    if (String(url).includes('oauth2.googleapis.com')) return jsonResponse(200, { access_token: 'at' });
    return jsonResponse(runStatus, runBody);
  };
}

test('main: exit 0 on pass', async () => {
  const io = makeIo();
  const code = await main(['runSelfTests'], {
    fetchImpl: fakeFetch(200, { done: true, response: { result: { passedCount: 3, totalTests: 3 } } }),
    stdout: io.stdout, stderr: io.stderr, env: makeEnv()
  });
  assert.equal(code, 0);
  assert.match(io.out.join(''), /"passedCount": 3/);
});

test('main: exit 1 on failing self-test', async () => {
  const io = makeIo();
  const code = await main(['runSelfTests'], {
    fetchImpl: fakeFetch(200, { done: true, response: { result: { passedCount: 2, totalTests: 3 } } }),
    stdout: io.stdout, stderr: io.stderr, env: makeEnv()
  });
  assert.equal(code, 1);
  assert.match(io.out.join(''), /"totalTests": 3/);
});

test('main: exit 2 on 403', async () => {
  const io = makeIo();
  const code = await main(['runSelfTests'], {
    fetchImpl: fakeFetch(403, { error: { code: 403, message: 'nope', status: 'PERMISSION_DENIED' } }),
    stdout: io.stdout, stderr: io.stderr, env: makeEnv()
  });
  assert.equal(code, 2);
  assert.match(io.err.join(''), /executionApi/);
  assert.ok(!io.err.join('').includes(SECRET_TOKEN));
});

test('main: exit 2 on usage', async () => {
  const io = makeIo();
  const code = await main([], { fetchImpl: fakeFetch(200, {}), stdout: io.stdout, stderr: io.stderr, env: makeEnv() });
  assert.equal(code, 2);
  assert.match(io.err.join(''), /Usage/);
});

test('main: calls the API-executable deployment (devMode false) and JSON-parses args', async () => {
  const io = makeIo();
  let sent;
  let sentUrl;
  const fetchImpl = async (url, opts) => {
    if (String(url).includes('oauth2')) return jsonResponse(200, { access_token: 'at' });
    sentUrl = String(url);
    sent = JSON.parse(opts.body);
    return jsonResponse(200, { done: true, response: { result: 'x' } });
  };
  const code = await main(['fn', '{"a":1}', 'plain'], { fetchImpl, stdout: io.stdout, stderr: io.stderr, env: makeEnv() });
  assert.equal(code, 0);
  assert.equal(sentUrl, `https://script.googleapis.com/v1/scripts/${API_DEPLOYMENT_ID}:run`);
  assert.deepEqual(sent, { function: 'fn', parameters: [{ a: 1 }, 'plain'], devMode: false });
});

test('main: --deploy pushes and repoints the API deployment before running', async () => {
  const io = makeIo();
  const steps = [];
  const fetchImpl = async (url) => {
    if (String(url).includes('oauth2')) return jsonResponse(200, { access_token: 'at' });
    steps.push('run');
    return jsonResponse(200, { done: true, response: { result: 1 } });
  };
  const deployImpl = (args) => steps.push(args.join(' '));
  const code = await main(['fn', '--deploy'], { fetchImpl, deployImpl, stdout: io.stdout, stderr: io.stderr, env: makeEnv() });
  assert.equal(code, 0);
  assert.deepEqual(steps, ['clasp push --force', `clasp update-deployment ${API_DEPLOYMENT_ID} -d gas-rpc API executable`, 'run']);
});

test('main: --deploy refuses when gas-app/.clasp.json is not the HOME script', async () => {
  const io = makeIo();
  const deployImpl = () => assert.fail('must not deploy');
  const env = { ...makeEnv(), GAS_RPC_CLASP_JSON: tmpFile('clasp.json', { scriptId: 'WORK-ID' }) };
  const code = await main(['fn', '--deploy'], { fetchImpl: fakeFetch(200, {}), deployImpl, stdout: io.stdout, stderr: io.stderr, env });
  assert.equal(code, 2);
  assert.match(io.err.join(''), /HOME/);
});

test('appsscript.json has executionApi and unchanged webapp', () => {
  const m = JSON.parse(fs.readFileSync(new URL('../gas-app/appsscript.json', import.meta.url), 'utf8'));
  assert.equal(m.executionApi.access, 'MYSELF');
  assert.deepEqual(m.webapp, { access: 'MYSELF', executeAs: 'USER_DEPLOYING' });
});

const DAY = 86400000;

test('checkTokenAge: first sight records fingerprint, no warning, never stores the token', () => {
  const state = tmpFile('state.json');
  assert.equal(checkTokenAge(SECRET_TOKEN, 1000, state), null);
  const saved = fs.readFileSync(state, 'utf8');
  assert.ok(!saved.includes(SECRET_TOKEN));
  assert.equal(checkTokenAge(SECRET_TOKEN, 1000 + 2 * DAY, state), null);
});

test('checkTokenAge: warns from day 6 with the expiry date and login command', () => {
  const state = tmpFile('state.json');
  const t0 = Date.UTC(2026, 9, 10);
  checkTokenAge(SECRET_TOKEN, t0, state);
  const msg = checkTokenAge(SECRET_TOKEN, t0 + 6 * DAY + 1, state);
  assert.match(msg, /6 days old/);
  assert.match(msg, /2026-10-17/);
  assert.match(msg, /clasp login --user rpc/);
});

test('checkTokenAge: a new refresh token (re-login) resets the clock', () => {
  const state = tmpFile('state.json');
  checkTokenAge('old', 0, state);
  assert.equal(checkTokenAge('new', 6.5 * DAY, state), null);
});

test('main: invalid_grant names the 7-day Testing expiry', async () => {
  const io = makeIo();
  const code = await main(['runSelfTest'], {
    fetchImpl: async () => jsonResponse(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }),
    stdout: io.stdout, stderr: io.stderr, env: makeEnv()
  });
  assert.equal(code, 2);
  assert.match(io.err.join(''), /7-day/);
});
