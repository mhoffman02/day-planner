/**
 * @file gasRpcDiscovery.js
 * @description Enumerates every client-callable RPC (google.script.run entry point) for the A17.5 coverage gate.
 * Union of: Code.gs delegators found by tools/check-rpc-guards.js (param-taking), names the client calls through
 * google.script.run chains / _runRpc / hubRpc (includes zero-arg entries), restricted to functions the .gs files define.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRpcEntries, triggerHandlers } from '../../tools/check-rpc-guards.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** @returns {string[]} Sorted RPC names. */
export function discoverRpcs() {
  const gsFiles = fs.readdirSync(path.join(ROOT, 'gas-app')).filter((f) => f.endsWith('.gs')).map((f) => read(`gas-app/${f}`));
  const client = ['gas-app/Script.html', 'src/gasBridge.js', 'gas-app/SetupFolder.html'].map(read).join('\n');
  const names = new Set(findRpcEntries(read('gas-app/Code.gs'), triggerHandlers(...gsFiles)));
  for (const m of client.matchAll(/(?:_?hubRpc|_runRpc)\(\s*'(\w+)'/g)) names.add(m[1]);
  const chain = /google\.script\.run\s*(?:\.\s*with\w+Handler\((?:[^()]|\([^()]*\))*\)\s*)*\.\s*(\w+)\(/g;
  for (const m of client.matchAll(chain)) names.add(m[1]);
  const defined = new Set(gsFiles.flatMap((t) => [...t.matchAll(/^function (\w+)\(/gm)].map((m) => m[1])));
  return [...names].filter((n) => defined.has(n)).sort();
}
