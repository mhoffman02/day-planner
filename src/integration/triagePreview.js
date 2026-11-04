/**
 * @file triagePreview.js
 * @description Triage row preview text beyond Gmail's ~200 char snippet: the latest message body without quoted
 * replies, whitespace collapsed, cut at TRIAGE_PREVIEW_MAX. Also the validated PreviewLines setting (how many lines
 * the expanded preview shows). Pure functions; no Google services.
 */

export const TRIAGE_PREVIEW_MAX = 400;
export const TRIAGE_PREVIEW_LINES_DEFAULT = 3;
const TRIAGEPREVIEW_LINES_MIN = 3;
const TRIAGEPREVIEW_LINES_MAX = 5;

// The reply header may wrap onto a second line, so match across at most one newline.
const TRIAGEPREVIEW_REPLY_HEADER = /^On [^\n]{0,200}(\n[^\n]{0,120})?\bwrote:\s*$/m;
const TRIAGEPREVIEW_DIVIDER = /^-{2,}\s*Original Message\s*-{2,}\s*$/im;

/**
 * @param {string} body Plain-text body of the latest message.
 * @returns {string} Up to TRIAGE_PREVIEW_MAX chars, ending in an ellipsis when cut; '' when nothing is left.
 */
export function triagePreview(body) {
  if (typeof body !== 'string') throw new Error('triagePreview: body must be a string');
  let text = body.replace(/\r\n?/g, '\n');
  [TRIAGEPREVIEW_REPLY_HEADER, TRIAGEPREVIEW_DIVIDER].forEach((re) => {
    const hit = re.exec(text);
    if (hit) text = text.slice(0, hit.index);
  });
  const flat = text.split('\n').filter((l) => !/^\s*>/.test(l)).join(' ').replace(/\s+/g, ' ').trim();
  return flat.length > TRIAGE_PREVIEW_MAX ? flat.slice(0, TRIAGE_PREVIEW_MAX - 1).trimEnd() + '…' : flat;
}

/**
 * @param {*} raw Hub Config PreviewLines cell (string) or number; undefined or '' means the default.
 * @returns {number} Whole number from 3 to 5.
 */
export function triagePreviewLines(raw) {
  if (raw === undefined || raw === null || raw === '') return TRIAGE_PREVIEW_LINES_DEFAULT;
  const text = String(raw).trim();
  const n = /^\d+$/.test(text) ? Number(text) : NaN;
  if (!(n >= TRIAGEPREVIEW_LINES_MIN && n <= TRIAGEPREVIEW_LINES_MAX)) {
    throw new Error('PreviewLines must be a whole number from ' + TRIAGEPREVIEW_LINES_MIN + ' to ' + TRIAGEPREVIEW_LINES_MAX + ', got ' + JSON.stringify(raw));
  }
  return n;
}
