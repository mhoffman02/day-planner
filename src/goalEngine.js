/**
 * @file goalEngine.js
 * @description Goals tab client logic (mirrored into gas-app/Script.html): the WBS outline, open
 * counts per horizon, the SMART check, progress roll-up and the life-area balance grid. The horizon
 * and area lists come from the server (src/integration/goalPlanner.js is their single source).
 */

function goalChildrenMap(goals) {
  const ids = new Set(goals.map(g => g.id));
  const byParent = new Map();
  for (const g of goals) {
    const key = g.parentId && ids.has(g.parentId) && g.parentId !== g.id ? g.parentId : null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(g);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => (a.target || '9999').localeCompare(b.target || '9999') || a.title.localeCompare(b.title));
  }
  return byParent;
}

/**
 * Flattens goals into outline rows, depth-first, with WBS codes (1, 1.2, 1.2.1).
 * A goal whose parent is missing is a root; a parent cycle is broken so every goal appears once.
 * @param {Array<object>} goals Goals ({id, title, parentId, target, ...}).
 * @param {Set<string>} [collapsed] Goal ids whose descendants are hidden.
 * @returns {Array<{goal: object, depth: number, wbs: string, childCount: number}>}
 */
export function buildGoalTree(goals, collapsed = new Set()) {
  const byParent = goalChildrenMap(goals);
  const rows = [];
  const seen = new Set();
  const visit = (goal, depth, wbs) => {
    if (seen.has(goal.id)) return;
    seen.add(goal.id);
    const kids = byParent.get(goal.id) || [];
    rows.push({ goal, depth, wbs, childCount: kids.length });
    if (collapsed.has(goal.id)) {
      descendantIds(goal.id, goals).forEach(id => seen.add(id));
      return;
    }
    kids.forEach((k, i) => visit(k, depth + 1, wbs + '.' + (i + 1)));
  };
  let n = 0;
  (byParent.get(null) || []).forEach(g => { n += 1; visit(g, 0, String(n)); });
  // Goals only reachable through a cycle: surface each as a root rather than lose it.
  goals.filter(g => !seen.has(g.id)).forEach(g => { n += 1; visit(g, 0, String(n)); });
  return rows;
}

/**
 * Open goals per horizon key.
 * @param {Array<object>} goals Goals.
 * @param {Array<{key: string}>} horizons Horizon list from the server.
 * @returns {Object<string, number>}
 */
export function horizonCounts(goals, horizons) {
  const counts = {};
  horizons.forEach(h => { counts[h.key] = 0; });
  goals.forEach(g => {
    if (g.status !== 'done' && g.horizon in counts) counts[g.horizon] += 1;
  });
  return counts;
}

/**
 * @param {Array<{key: string, child: (string|null)}>} horizons Horizon list.
 * @param {string} key Horizon key.
 * @returns {string|null} The next lower horizon, or null below the last.
 */
export function childHorizonKey(horizons, key) {
  const h = horizons.find(x => x.key === key);
  return h ? h.child : null;
}

/**
 * SMART check: one row per letter, ok plus the hint to show.
 * @param {object} goal Goal.
 * @returns {Array<{key: string, ok: boolean, text: string}>}
 */
export function smartCheck(goal) {
  const has = v => typeof v === 'string' && v.trim() !== '';
  const words = (goal.title || '').trim().split(/\s+/).filter(Boolean).length;
  return [
    { key: 'S', ok: words >= 3, text: words >= 3 ? 'Specific: names a concrete result' : 'Specific: say exactly what will be true' },
    { key: 'M', ok: has(goal.measure), text: has(goal.measure) ? 'Measurable: ' + goal.measure : 'Measurable: add how you will know it is done' },
    { key: 'A', ok: has(goal.ifThen), text: has(goal.ifThen) ? 'Achievable: obstacle planned for' : 'Achievable: plan for the main obstacle' },
    { key: 'R', ok: has(goal.parentId) || has(goal.value), text: has(goal.parentId) || has(goal.value) ? 'Relevant: serves a value or a bigger goal' : 'Relevant: link a value or a parent goal' },
    { key: 'T', ok: has(goal.target), text: has(goal.target) ? 'Time-bound: ' + goal.target : 'Time-bound: set a target date' }
  ];
}

/**
 * Every descendant id of a goal (cycle-safe).
 * @param {string} id Goal id.
 * @param {Array<object>} goals Goals.
 * @returns {Array<string>}
 */
export function descendantIds(id, goals) {
  const out = [];
  const seen = new Set([id]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift();
    goals.forEach(g => {
      if (g.parentId === cur && !seen.has(g.id)) {
        seen.add(g.id);
        out.push(g.id);
        queue.push(g.id);
      }
    });
  }
  return out;
}

/**
 * Share of done leaves under a goal; a done goal counts as complete; a leaf is 1 or 0.
 * @param {string} id Goal id.
 * @param {Array<object>} goals Goals.
 * @returns {number} 0..1
 */
export function rollupProgress(id, goals) {
  const goal = goals.find(g => g.id === id);
  if (!goal) return 0;
  if (goal.status === 'done') return 1;
  const desc = new Set(descendantIds(id, goals));
  if (desc.size === 0) return 0;
  const parents = new Set(goals.filter(g => desc.has(g.id)).map(g => g.parentId));
  const leaves = goals.filter(g => desc.has(g.id) && !parents.has(g.id));
  return leaves.filter(g => g.status === 'done').length / leaves.length;
}

/**
 * Open goals per life area and horizon. `gap` marks an area that has open goals but none at the
 * lowest horizon: planned on paper, nothing scheduled to make it happen.
 * @param {Array<object>} goals Goals.
 * @param {Array<{key: string}>} horizons Horizon list.
 * @param {Array<string>} areas Life areas, in display order.
 * @returns {Array<{area: string, counts: Object<string, number>, gap: boolean}>}
 */
export function balanceByArea(goals, horizons, areas) {
  const lowest = horizons[horizons.length - 1].key;
  return areas.map(area => {
    const counts = horizonCounts(goals.filter(g => g.area === area), horizons);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { area, counts, gap: total > 0 && counts[lowest] === 0 };
  });
}
