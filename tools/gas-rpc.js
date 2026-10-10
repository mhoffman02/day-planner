#!/usr/bin/env node
/**
 * @file tools/gas-rpc.js
 * @description Calls the Google Apps Script Execution API (scripts.run) on the HOME script so an
 * agent can run server-side GAS functions headlessly. Prints JSON results; exit code 0 = ok,
 * 1 = script/test failure, 2 = usage/auth/http error. HOME-only by design: the script ID is read
 * from gas-app/.clasp.json and there is no override flag.
 *
 * Usage:
 *   node tools/gas-rpc.js <functionName> [jsonArg ...] [--raw] [--prod]
 *
 * Auth: reuses the clasp login refresh token (~/.clasprc.json, or env GAS_RPC_CLASPRC).
 * Setup: npx clasp login --user rpc --creds ~/.config/day-planner/clasp-run-client.json --use-project-scopes
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CLASP_JSON = path.join(REPO_ROOT, 'gas-app', '.clasp.json');
const LOGIN_HINT = 'Run: npx clasp login --user rpc --creds ~/.config/day-planner/clasp-run-client.json --use-project-scopes';
const USAGE = 'Usage: node tools/gas-rpc.js <functionName> [jsonArg ...] [--raw] [--prod]';

function readJsonFile(filePath, label, hint) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`gas-rpc: cannot read ${label} at ${filePath}`, err.stack);
    throw new Error(`Cannot read ${label} at ${filePath}. ${hint}`, { cause: err });
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error(`gas-rpc: invalid JSON in ${label} at ${filePath}`, err.stack);
    throw new Error(`Invalid JSON in ${label} at ${filePath}. ${hint}`, { cause: err });
  }
}

/**
 * Load OAuth client + refresh token from a clasp rc file (3.x or legacy 2.x shape).
 * @param {string} [rcPath]
 * @param {Record<string,string|undefined>} [env]
 * @returns {{clientId:string, clientSecret:string, refreshToken:string}}
 */
export function loadClaspCredentials(rcPath, env = process.env) {
  const file = rcPath || env.GAS_RPC_CLASPRC || path.join(os.homedir(), '.clasprc.json');
  const rc = readJsonFile(file, 'clasp credentials', LOGIN_HINT);
  // `clasp login --user rpc` keeps the project-client token apart from the `default` push login.
  const user = env.GAS_RPC_CLASP_USER || (rc && rc.tokens && rc.tokens.rpc ? 'rpc' : 'default');
  let clientId;
  let clientSecret;
  let refreshToken;
  if (rc && rc.tokens && rc.tokens[user]) {
    const t = rc.tokens[user];
    clientId = t.client_id;
    clientSecret = t.client_secret;
    refreshToken = t.refresh_token;
  } else if (rc && rc.token) {
    refreshToken = rc.token.refresh_token;
    const s = rc.oauth2ClientSettings || {};
    clientId = s.clientId;
    clientSecret = s.clientSecret;
  }
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(`clasp credentials in ${file} are missing client id, client secret, or refresh token. ${LOGIN_HINT}`);
  }
  return { clientId, clientSecret, refreshToken };
}

/**
 * Read the HOME script ID from gas-app/.clasp.json. No override by design.
 * @param {string} [claspJsonPath]
 * @returns {string}
 */
export function readScriptId(claspJsonPath = DEFAULT_CLASP_JSON) {
  const cfg = readJsonFile(claspJsonPath, '.clasp.json', 'Expected gas-app/.clasp.json with a scriptId.');
  if (!cfg || typeof cfg.scriptId !== 'string' || !cfg.scriptId) {
    throw new Error(`No scriptId found in ${claspJsonPath}`);
  }
  return cfg.scriptId;
}

/**
 * Exchange the refresh token for an access token.
 * @returns {Promise<string>}
 */
export async function refreshAccessToken(creds, fetchImpl = fetch) {
  const body = new globalThis.URLSearchParams({
    grant_type: 'refresh_token',
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken
  });
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const data = await res.json();
  if (!res.ok || !data || !data.access_token) {
    const detail = [data && data.error, data && data.error_description].filter(Boolean).join(': ');
    throw new Error(`Token refresh failed (HTTP ${res.status}): ${detail || 'no access_token returned'}. ${LOGIN_HINT}`);
  }
  return data.access_token;
}

/** Build the scripts.run request body. */
export function buildRunRequest(functionName, parameters = [], devMode = true) {
  if (!functionName || !/^[A-Za-z_$][\w$]*$/.test(functionName)) {
    throw new Error(`Invalid function name: ${JSON.stringify(functionName)}`);
  }
  return { function: functionName, parameters, devMode };
}

/** POST scripts.run; returns parsed JSON plus httpStatus. */
export async function runFunction({ scriptId, accessToken, body, fetchImpl = fetch }) {
  const res = await fetchImpl(`https://script.googleapis.com/v1/scripts/${scriptId}:run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  return { ...data, httpStatus: res.status };
}

function httpHint(status, apiStatus) {
  if (status === 403 || apiStatus === 'PERMISSION_DENIED') {
    return 'Script must be linked to the same standard GCP project as the OAuth client, Apps Script API enabled in that project, and `executionApi` present in the pushed manifest';
  }
  if (status === 404) return 'scriptId wrong or no API-executable access (push manifest with executionApi)';
  if (status === 401) return 're-run clasp login';
  return undefined;
}

/**
 * Interpret a scripts.run response.
 * @returns {{ok:boolean, result?:any, error?:object}}
 */
export function interpretRunResponse(resp) {
  const status = resp.httpStatus;
  if (typeof status === 'number' && (status < 200 || status >= 300)) {
    return {
      ok: false,
      error: { kind: 'http', status, message: resp.error?.message, hint: httpHint(status, resp.error?.status) }
    };
  }
  if (resp.error) {
    const d = resp.error.details?.[0] || {};
    return {
      ok: false,
      error: {
        kind: 'script',
        message: d.errorMessage || resp.error.message,
        errorType: d.errorType,
        stack: d.scriptStackTraceElements || []
      }
    };
  }
  const result = resp.response?.result;
  let failed = false;
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    if (typeof result.passedCount === 'number' && typeof result.totalTests === 'number' && result.passedCount !== result.totalTests) failed = true;
    if (typeof result.overallStatus === 'string' && /FAIL|UNHEALTHY/i.test(result.overallStatus)) failed = true;
  } else if (Array.isArray(result)) {
    if (result.some((r) => r && typeof r === 'object' && r.status === 'FAIL')) failed = true;
  }
  return { ok: !failed, result };
}

function parseArg(s) {
  try {
    return JSON.parse(s);
  } catch (err) {
    // Not JSON: documented fallback is to pass the raw string through unchanged.
    console.error(`gas-rpc: arg is not JSON, passing as string (${err.message})`);
    return s;
  }
}

/**
 * CLI entry. Returns the exit code.
 */
export async function main(argv, { fetchImpl = fetch, stdout = process.stdout, stderr = process.stderr, env = process.env } = {}) {
  const raw = argv.includes('--raw');
  const prod = argv.includes('--prod');
  const positional = argv.filter((a) => a !== '--raw' && a !== '--prod');
  if (positional.length === 0) {
    stderr.write(`${USAGE}\n`);
    return 2;
  }
  try {
    const [fn, ...rawArgs] = positional;
    const body = buildRunRequest(fn, rawArgs.map(parseArg), !prod);
    const scriptId = readScriptId();
    const creds = loadClaspCredentials(undefined, env);
    const accessToken = await refreshAccessToken(creds, fetchImpl);
    const resp = await runFunction({ scriptId, accessToken, body, fetchImpl });
    const out = interpretRunResponse(resp);
    if (raw) {
      stdout.write(`${JSON.stringify(resp, null, 2)}\n`);
    } else if (out.ok || out.error?.kind !== 'http') {
      if (out.result !== undefined) stdout.write(`${JSON.stringify(out.result, null, 2)}\n`);
    }
    if (!out.ok && out.error) stderr.write(`${JSON.stringify(out.error, null, 2)}\n`);
    if (out.ok) return 0;
    return out.error && out.error.kind === 'http' ? 2 : 1;
  } catch (err) {
    console.error('gas-rpc: failed', err.stack);
    stderr.write(`${JSON.stringify({ kind: 'client', message: err.message })}\n`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
