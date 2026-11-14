/**
 * @file Tabs of the same browser share confirmed note saves, so an idle tab never keeps a stale
 * save baseline (which would make its next save report a false Google Docs conflict).
 * Pure helpers, hand-mirrored into gas-app/Script.html.
 */

/** BroadcastChannel name every tab of the app joins. */
export const NOTE_SYNC_CHANNEL = 'day-planner-note-saves';

/**
 * @param {string} tabId Sender tab.
 * @param {string} dateStr Local date key, YYYY-MM-DD.
 * @param {string} text Note text Google Docs just confirmed.
 * @returns {{type: string, tabId: string, date: string, text: string}}
 */
export function noteSavedMessage(tabId, dateStr, text) {
  return { type: 'note-saved', tabId, date: dateStr, text };
}

/**
 * Text this tab should take as its saved note for msg.date, or null to ignore the message.
 * A tab with unsaved edits for that day keeps its own baseline: its next save then reports
 * the real clash instead of silently replacing the text of the other tab.
 * @param {Object} msg Received message.
 * @param {string} ownTabId This tab.
 * @param {{savedText?: string, editorText?: string, unsaved: boolean}} local State of this tab for msg.date.
 * @returns {string|null}
 */
export function peerNoteToAdopt(msg, ownTabId, local) {
  if (!msg || msg.type !== 'note-saved' || msg.tabId === ownTabId) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(msg.date || '') || typeof msg.text !== 'string') return null;
  if (!local || local.unsaved || typeof local.savedText !== 'string') return null;
  if (typeof local.editorText === 'string' && local.editorText !== local.savedText) return null;
  return msg.text === local.savedText ? null : msg.text;
}
