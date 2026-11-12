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
