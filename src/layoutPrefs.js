/**
 * @file layoutPrefs.js
 * @description Pure helpers for the user-resizable reading width of the About and Tutorial pages.
 * gas-app/Script.html carries a mirrored copy (GAS cannot import modules); tests/layoutPrefs.test.js
 * asserts both copies exist.
 */

export const READING_WIDTH_DEFAULT = 960;
export const READING_WIDTH_MIN = 480;
export const READING_WIDTH_MAX = 4000;

export function clampReadingWidth(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return READING_WIDTH_DEFAULT;
  return Math.min(READING_WIDTH_MAX, Math.max(READING_WIDTH_MIN, v));
}

export function parseSavedReadingWidth(raw) {
  if (typeof raw !== 'string' || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < READING_WIDTH_MIN || n > READING_WIDTH_MAX) {
    console.error('parseSavedReadingWidth: saved reading width is out of range, using the default:', raw);
    return null;
  }
  return Math.round(n);
}

// The page is centered, so a dragged edge moves both edges: width changes by twice the pointer delta.
// deltaPx is in viewport px; zoomPct converts it to the zoomed CSS px the width is expressed in.
export function resizedReadingWidth(startWidth, deltaPx, side, zoomPct) {
  const sign = side === 'left' ? -1 : 1;
  return clampReadingWidth(startWidth + (2 * sign * deltaPx) / (zoomPct / 100));
}

export const TABLE_COL_MIN = 40;
export const TABLE_COL_MAX = 1200;
const TABLE_COL_IDS = ['daily', 'master', 'index', 'hub'];

export function clampColWidth(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return null;
  return Math.min(TABLE_COL_MAX, Math.max(TABLE_COL_MIN, v));
}

// deltaPx is in viewport px; zoomPct converts it to the zoomed CSS px widths are expressed in.
export function resizedColWidth(startWidth, deltaPx, zoomPct) {
  return clampColWidth(startWidth + deltaPx / (zoomPct / 100));
}

// rights: right-edge x of each header cell. Returns the index of the boundary under x, else -1.
export function colEdgeAt(rights, x, slop) {
  for (let i = 0; i < rights.length; i++) {
    if (Math.abs(x - rights[i]) <= slop) return i;
  }
  return -1;
}

// The one flex column absorbs leftover space, so it has no width of its own: dragging its edge
// instead moves the boundary by resizing its right neighbour the opposite way.
export function colResizePlan(edgeIdx, flexIdx, ncols) {
  if (edgeIdx !== flexIdx) return { col: edgeIdx, sign: 1 };
  if (edgeIdx + 1 < ncols) return { col: edgeIdx + 1, sign: -1 };
  return null;
}

export function colVarName(tableId, colIdx) {
  return `--tc-${tableId}-${colIdx + 1}`;
}

// Saved shape: { tableId: { colIndex: px } }. Invalid entries are dropped, not fatal.
function validSavedCol(id, k, w) {
  const ok = /^\d+$/.test(k) && typeof w === 'number' && w >= TABLE_COL_MIN && w <= TABLE_COL_MAX;
  if (!ok) console.error('parseSavedTableCols: dropping invalid saved column width:', id, k, w);
  return ok;
}

export function parseSavedTableCols(raw) {
  if (typeof raw !== 'string' || raw === '') return {};
  let v;
  try {
    v = JSON.parse(raw);
  } catch (err) {
    console.error('parseSavedTableCols: saved table columns are not valid JSON, using defaults:', err.stack);
    return {};
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out = {};
  for (const id of TABLE_COL_IDS) {
    const cols = v[id];
    if (!cols || typeof cols !== 'object') continue;
    for (const k of Object.keys(cols)) {
      if (validSavedCol(id, k, cols[k])) (out[id] = out[id] || {})[k] = Math.round(cols[k]);
    }
  }
  return out;
}
