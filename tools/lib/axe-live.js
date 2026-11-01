/**
 * @file tools/lib/axe-live.js
 * @description Runs axe-core inside the Day Planner app iframe of a CDP tab and ratchets the
 * per-rule violation counts against axe-baseline.json. Used by tools/deploy-home.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { countByRule, compareAxe, lowerBaseline } from './axe-ratchet.js';

const require = createRequire(import.meta.url);

function cdpEval(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => { ws.close(); reject(new Error('axe: CDP evaluate timed out after 60s')); }, 60000);
    ws.onerror = () => { clearTimeout(timer); reject(new Error(`axe: CDP websocket error for ${wsUrl}`)); };
    ws.onopen = () => ws.send(JSON.stringify({
      id: 1, method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: true },
    }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      if (msg.error) return reject(new Error(`axe: CDP error ${JSON.stringify(msg.error)}`));
      if (msg.result.exceptionDetails) {
        return reject(new Error(`axe: page threw ${msg.result.exceptionDetails.exception?.description || msg.result.exceptionDetails.text}`));
      }
      resolve(msg.result.result.value);
    };
  });
}

/** Returns {counts}. Throws if the app iframe target is missing or axe fails. */
export async function runAxeInTab(port, tabId) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const frame = targets.find((t) => t.type === 'iframe' && t.parentId === tabId);
  if (!frame) throw new Error(`axe: no app iframe target under tab ${tabId}`);
  const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  const expression = `(async () => { ${axeSource}\n const r = await window.axe.run(document); return { violations: r.violations.map(v => ({ id: v.id, nodes: v.nodes.map(() => 0) })) }; })()`;
  const out = await cdpEval(frame.webSocketDebuggerUrl, expression);
  return { counts: countByRule(out.violations) };
}

/** Compare to axe-baseline.json; with update=true write the lowered (or, if absent, seed) baseline. */
export function ratchetAxe(root, counts, update) {
  const file = path.join(root, 'axe-baseline.json');
  if (!fs.existsSync(file)) {
    if (!update) throw new Error('axe-baseline.json is missing; seed it with: npm run deploy:home -- --check --update-axe');
    fs.writeFileSync(file, JSON.stringify(counts, null, 2) + '\n');
    return { ok: true, failures: [], improvements: [], seeded: true };
  }
  const baseline = JSON.parse(fs.readFileSync(file, 'utf8'));
  const result = compareAxe(baseline, counts);
  if (update && result.ok) {
    fs.writeFileSync(file, JSON.stringify(lowerBaseline(baseline, counts), null, 2) + '\n');
  }
  return result;
}
