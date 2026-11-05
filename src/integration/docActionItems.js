/**
 * @file docActionItems.js
 * @description Pure row builder for Doc action items in Triage (Drive comments assigned to the user).
 * Input is the Drive v3 comments.list payload for one file; no Google services, no Date.now, so it
 * runs in node and (through Engines.gs) in GAS. Comment text is display-only: it is capped here and
 * is never written to the ledger.
 */

export const DOC_ACTION_SNIPPET_CAP = 160;
export const DOC_ACTION_PREVIEW_CAP = 2000;
export const DOC_ACTION_SOURCE_TAG = 'Doc action item';
export const DOC_ACTION_SOURCE_TYPE = 'DOC_COMMENT';
/** Fixed triage scores: no Gmail signals exist. 8 is the high-confidence band, 4 the human-review band; both land in Direct Action. */
export const DOC_ACTION_SCORE_ASSIGNED = 8;
export const DOC_ACTION_SCORE_UNMATCHED = 4;

const DOC_URL_PATH = Object.freeze({
  'application/vnd.google-apps.document': 'document',
  'application/vnd.google-apps.spreadsheet': 'spreadsheets',
  'application/vnd.google-apps.presentation': 'presentation'
});

/**
 * @param {{id:string, mimeType?:string}} file Drive file.
 * @param {string} [commentId] Comment id for a deep link; omitted for a file-level link.
 * @returns {string} Editor URL.
 */
export function docActionUrl(file, commentId) {
  const kind = DOC_URL_PATH[file.mimeType] || 'document';
  const base = `https://docs.google.com/${kind}/d/${file.id}/edit`;
  return commentId ? `${base}?disco=${commentId}` : base;
}

function joinText(quoted, content) {
  return [quoted, content].map((p) => String(p || '').trim()).filter(Boolean).join(' ');
}

function baseRow(file, itemId, commentId, text, fromName, date, unmatched) {
  return {
    itemId,
    sourceType: DOC_ACTION_SOURCE_TYPE,
    sourceTag: DOC_ACTION_SOURCE_TAG,
    fileId: file.id,
    commentId,
    subject: file.name || '(untitled)',
    snippet: text.slice(0, DOC_ACTION_SNIPPET_CAP),
    preview: text.slice(0, DOC_ACTION_PREVIEW_CAP),
    fromName,
    date,
    url: docActionUrl(file, commentId === 'FILE' ? '' : commentId),
    unmatched,
    score: unmatched ? DOC_ACTION_SCORE_UNMATCHED : DOC_ACTION_SCORE_ASSIGNED
  };
}

/**
 * One row per open comment assigned to the user; a file with none yields one unmatched file-level row.
 * @param {{file:{id:string,name?:string,mimeType?:string}, comments:Array<object>, userEmail:string}} a Inputs.
 * @returns {Array<object>} Triage rows (never empty).
 */
export function selectAssignedComments(a) {
  if (!a || !a.file || !a.file.id) throw new Error('selectAssignedComments: file.id required');
  if (typeof a.userEmail !== 'string' || a.userEmail.trim() === '') throw new Error('selectAssignedComments: userEmail required');
  const me = a.userEmail.trim().toLowerCase();
  const rows = (a.comments || [])
    .filter((c) => c && c.id && !c.deleted && !c.resolved && String(c.assigneeEmailAddress || '').toLowerCase() === me)
    .map((c) => baseRow(a.file, `${a.file.id}~${c.id}`, c.id,
      joinText(c.quotedFileContent && c.quotedFileContent.value, c.content),
      (c.author && c.author.displayName) || '', c.modifiedTime || '', false));
  if (rows.length) return rows;
  const fallback = baseRow(a.file, `${a.file.id}~FILE`, 'FILE', '', '', '', true);
  return [fallback];
}
