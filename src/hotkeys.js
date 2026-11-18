/**
 * @file hotkeys.js
 * @description Gmail-style keyboard shortcuts (user 2026-11-18): one table drives both the key dispatch and the "?"
 * help overlay, so the help cannot drift from what the keys do. Pure: no DOM, no Alpine, runs in node.
 * Window keys (j k e # T m o Enter ?) act on the cursor row of Triage, Today tasks or Master Tasks and never fire
 * while typing or while a dialog is open. Notes keys (Ctrl+Shift+7 / 8) match by physical key because Shift changes e.key.
 */

export const HOTKEY_VIEWS = Object.freeze({ triage: 'triage', daily: 'daily', master: 'master-tasks' });
const ROW_VIEWS = [HOTKEY_VIEWS.triage, HOTKEY_VIEWS.daily, HOTKEY_VIEWS.master];

export const HOTKEY_SECTIONS = Object.freeze(['Navigation', 'Triage', 'Tasks', 'Notes', 'Application']);

/**
 * scope window: dispatched from the window keydown handler. scope notes: dispatched from the Notes line editor.
 * A combo is { label, key?, code?, ctrl?, shift? }: ctrl means Ctrl or Cmd; shift undefined means "ignore Shift" (symbols
 * such as # and ? need it); repeat true allows a held key (cursor moves only, never a destructive action).
 */
export const HOTKEYS = Object.freeze([
  { id: 'cursor-next', section: 'Navigation', scope: 'window', views: ROW_VIEWS, label: 'Next row', combos: [{ label: 'j', key: 'j', shift: false, repeat: true }] },
  { id: 'cursor-prev', section: 'Navigation', scope: 'window', views: ROW_VIEWS, label: 'Previous row', combos: [{ label: 'k', key: 'k', shift: false, repeat: true }] },
  { id: 'open', section: 'Navigation', scope: 'window', views: [HOTKEY_VIEWS.triage], label: 'Open the email in Gmail (the Doc for a Doc row)', combos: [{ label: 'o', key: 'o', shift: false }, { label: 'Enter', key: 'Enter', shift: false, notOnControl: true }] },
  { id: 'triage-archive', section: 'Triage', scope: 'window', views: [HOTKEY_VIEWS.triage], label: 'Archive in Gmail, then next row', combos: [{ label: 'e', key: 'e', shift: false }] },
  { id: 'trash', section: 'Triage', scope: 'window', views: ROW_VIEWS, label: 'Trash: move the email to Gmail Trash, or delete the task', combos: [{ label: '#', key: '#' }] },
  { id: 'triage-task-today', section: 'Triage', scope: 'window', views: [HOTKEY_VIEWS.triage], label: 'Task Today (a Doc row: Task)', combos: [{ label: 'Shift + t', key: 'T', shift: true }] },
  { id: 'triage-dismiss', section: 'Triage', scope: 'window', views: [HOTKEY_VIEWS.triage], label: 'Dismiss from Triage, then next row', combos: [{ label: 'm', key: 'm', shift: false }] },
  { id: 'notes-bullets', section: 'Notes', scope: 'notes', label: 'Bulleted list', combos: [{ label: 'Ctrl + Shift + 8', code: 'Digit8', ctrl: true, shift: true }] },
  { id: 'notes-numbers', section: 'Notes', scope: 'notes', label: 'Numbered list', combos: [{ label: 'Ctrl + Shift + 7', code: 'Digit7', ctrl: true, shift: true }] },
  { id: 'help', section: 'Application', scope: 'window', views: null, label: 'Show or hide this list', combos: [{ label: '?', key: '?' }] }
]);

function comboMatches(c, e) {
  const mod = !!(e.ctrlKey || e.metaKey);
  if (mod !== !!c.ctrl || e.altKey) return false;
  if (c.shift !== undefined && !!e.shiftKey !== c.shift) return false;
  return c.code ? e.code === c.code : e.key === c.key;
}

/**
 * Which window shortcut a keydown means, or null. Keys are ignored while typing, while a dialog or menu is open,
 * while an IME is composing, and (for everything but j and k) while a key is held down.
 * @param {{key:string, code?:string, ctrlKey?:boolean, metaKey?:boolean, altKey?:boolean, shiftKey?:boolean, repeat?:boolean, isComposing?:boolean, defaultPrevented?:boolean}} e Keyboard event.
 * @param {{view:string, typing?:boolean, onControl?:boolean, modalOpen?:boolean, helpOpen?:boolean}} ctx typing: a text field has focus; onControl: a button or link has focus (Enter belongs to it); modalOpen: a dialog or menu is open.
 * @returns {?string} Hotkey id.
 */
export function resolveHotkey(e, ctx) {
  if (!e || e.defaultPrevented || e.isComposing || ctx.typing) return null;
  if (ctx.modalOpen && !ctx.helpOpen) return null;
  for (const h of HOTKEYS) {
    if (!windowKeyApplies(h, ctx)) continue;
    const hit = h.combos.find((c) => comboMatches(c, e));
    if (hit) return comboAllowed(hit, e, ctx) ? h.id : null;
  }
  return null;
}

// While the help overlay is open only "?" (toggle) is live, so j, e or # cannot act on the rows behind it.
function windowKeyApplies(h, ctx) {
  if (h.scope !== 'window') return false;
  if (ctx.helpOpen && h.id !== 'help') return false;
  return !h.views || h.views.indexOf(ctx.view) !== -1;
}

function comboAllowed(hit, e, ctx) {
  if (e.repeat && !hit.repeat) return false;
  return !(hit.notOnControl && ctx.onControl);
}

/**
 * Which Notes line-editor shortcut a keydown means, or null.
 * @param {{code?:string, ctrlKey?:boolean, metaKey?:boolean, altKey?:boolean, shiftKey?:boolean}} e Keyboard event.
 * @returns {?string} Hotkey id.
 */
export function resolveNotesHotkey(e) {
  for (const h of HOTKEYS) {
    if (h.scope === 'notes' && h.combos.some((c) => comboMatches(c, e))) return h.id;
  }
  return null;
}

/**
 * Cursor move with no wrap. With no cursor yet (or a cursor row that is gone), either direction lands on the first row.
 * @param {string[]} ids Row ids in display order.
 * @param {string} currentId Current cursor id.
 * @param {number} delta 1 for next, -1 for previous.
 * @returns {string} New cursor id, or an empty string when there are no rows.
 */
export function stepCursor(ids, currentId, delta) {
  if (!ids.length) return '';
  const at = ids.indexOf(currentId);
  if (at === -1) return ids[0];
  return ids[Math.min(Math.max(at + delta, 0), ids.length - 1)];
}

/**
 * Where the cursor goes when its row leaves the list (archived, trashed, dismissed): the row that takes its place,
 * else the one before it, else nothing.
 * @param {string[]} ids Row ids in display order, before the removal.
 * @param {string} removedId The row that is leaving.
 * @returns {string} New cursor id.
 */
export function cursorAfterRemoval(ids, removedId) {
  const at = ids.indexOf(removedId);
  if (at === -1) return '';
  return ids[at + 1] || ids[at - 1] || '';
}

/**
 * Help-overlay content straight from the table.
 * @returns {Array<{section:string, rows:Array<{keys:string, label:string}>}>} Sections that have at least one row.
 */
export function hotkeySections() {
  return HOTKEY_SECTIONS
    .map((section) => ({ section, rows: HOTKEYS.filter((h) => h.section === section).map((h) => ({ keys: h.combos.map((c) => c.label).join(' or '), label: h.label })) }))
    .filter((s) => s.rows.length > 0);
}
