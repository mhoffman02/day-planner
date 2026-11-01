/**
 * @file tools/lib/axe-ratchet.js
 * @description Pure ratchet logic for the axe-core check in the deploy:home live gate.
 * axe-baseline.json maps rule id -> violating node count; counts only go down.
 */

/** @param {Array<{id: string, nodes: unknown[]}>} violations axe.run().violations */
export function countByRule(violations) {
  if (!Array.isArray(violations)) throw new Error('countByRule: violations must be an array');
  const counts = {};
  for (const v of violations) {
    if (!v || typeof v.id !== 'string' || !Array.isArray(v.nodes)) {
      throw new Error(`countByRule: violation needs a string id and a nodes array: ${JSON.stringify(v)}`);
    }
    counts[v.id] = (counts[v.id] || 0) + v.nodes.length;
  }
  return counts;
}

/** New rule ids or higher counts fail; lower or cleared counts are improvements. */
export function compareAxe(baseline, current) {
  const failures = [];
  const improvements = [];
  for (const [id, n] of Object.entries(current)) {
    if (!(id in baseline)) {
      failures.push(`NEW rule ${id}: ${n} violating node(s), not in axe-baseline.json`);
    } else if (n > baseline[id]) {
      failures.push(`${id}: ${baseline[id]} -> ${n} violating nodes (counts may only go down)`);
    } else if (n < baseline[id]) {
      improvements.push(`${id}: ${baseline[id]} -> ${n}`);
    }
  }
  for (const id of Object.keys(baseline)) {
    if (!(id in current)) improvements.push(`${id}: ${baseline[id]} -> 0`);
  }
  return { ok: failures.length === 0, failures, improvements };
}

/** Baseline after --update: min(old, new) per existing rule, cleared rules dropped, never adds. */
export function lowerBaseline(baseline, current) {
  const out = {};
  for (const [id, n] of Object.entries(baseline)) {
    const now = current[id] || 0;
    if (now > 0) out[id] = Math.min(n, now);
  }
  return out;
}
