/**
 * @file geminiParser.js
 * @description Deterministic parser for Gemini-generated meeting notes (spec section 13) plus the
 * MeetingNotesProvider adapter base. Finds explicit action headings and checkbox/list items under
 * them only; AI extraction is deferred. Proposes items, never creates anything. Pure; no clock, no
 * crypto dependency, no logging of note content.
 *
 * docModel accepts: null/undefined/'' (no notes -> []), a plain string (lines), an array of
 * paragraphs, or {paragraphs:[...]}. A paragraph is a string or {text, heading?:boolean, list?:boolean}.
 */

const GEMINIPARSER_ACTION_HEADING_RE = /^(?:suggested\s+)?(?:action\s+items?|next\s+steps?|follow[- ]?ups?|to[- ]?dos?)$/i;
const GEMINIPARSER_OTHER_HEADING_RE = /^(?:summary|decisions?|key\s+(?:points|decisions)|details|attendees|notes|discussion|overview)$/i;
const GEMINIPARSER_LIST_MARKER_RE = /^\s*(?:[-*•]\s+|\d+[.)]\s+|\[[ xX]?\]\s*)/;
const GEMINIPARSER_CHECKBOX_RE = /^\s*(?:[-*•]\s+)?\[[ xX]?\]\s*/;
const GEMINIPARSER_DATE_WORD_RE = /\b(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat|sun)[a-z]*\b|\btoday\b|\btomorrow\b|\beo[dw]\b|\bcob\b|\basap\b|\bnext (?:week|month)\b|\bend of\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2}/i;
const GEMINIPARSER_NOT_OWNERS = new Set(['We', 'I', 'They', 'It', 'There', 'This', 'That', 'Everyone', 'Team', 'The']);

function geminiparserParagraphs(docModel) {
  if (docModel === null || docModel === undefined || docModel === '') return [];
  let raw;
  if (typeof docModel === 'string') raw = docModel.split('\n');
  else if (Array.isArray(docModel)) raw = docModel;
  else if (typeof docModel === 'object' && Array.isArray(docModel.paragraphs)) raw = docModel.paragraphs;
  else throw new Error('parseGeminiNotes: docModel must be a string, paragraph array, or {paragraphs}');
  let offset = 0;
  return raw.map((p) => {
    const para = typeof p === 'string' ? { text: p } : p;
    if (!para || typeof para.text !== 'string') throw new Error('parseGeminiNotes: paragraph must be a string or {text}');
    const out = { text: para.text, heading: para.heading === true, list: para.list === true, offset };
    offset += para.text.length + 1;
    return out;
  });
}

function geminiparserHeadingText(text) {
  return text.trim().replace(/^#{1,6}\s*/, '').replace(/\*\*|__/g, '').replace(/:\s*$/, '').trim();
}

/** @returns {'action'|'other'|null} */
function geminiparserClassifyHeading(p) {
  const isListItem = p.list || GEMINIPARSER_LIST_MARKER_RE.test(p.text);
  const clean = geminiparserHeadingText(p.text);
  if (clean === '') return null;
  if (GEMINIPARSER_ACTION_HEADING_RE.test(clean) && (p.heading || !isListItem)) return 'action';
  if (p.heading || /^\s*#/.test(p.text)) return 'other';
  if (!isListItem && GEMINIPARSER_OTHER_HEADING_RE.test(clean)) return 'other';
  return null;
}

function geminiparserHash32(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Stable 16-hex-char hash of the normalized action text (own FNV-1a, two seeds). */
function geminiparserActionHash(text) {
  const norm = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return geminiparserHash32(norm, 0x811c9dc5) + geminiparserHash32(norm, 0x01000193);
}

function geminiparserOwnerAndText(raw) {
  const text = raw;
  const lead = text.match(/^owner:\s*([^-–—:,;]+?)\s*(?:[-–—:]\s*|$)(.*)$/i);
  if (lead) return { owner: lead[1].trim(), text: lead[2].trim() };
  const trail = text.match(/[,;(]\s*owner:\s*([^,;()]+)\)?\s*$/i);
  if (trail) {
    return { owner: trail[1].trim(), text: text.slice(0, trail.index).trim() };
  }
  const at = text.match(/@([\w.-]+)/);
  if (at) return { owner: at[1], text };
  const will = text.match(/^([A-Z][\w'’.-]*(?: [A-Z][\w'’.-]*){0,2}) will\b/);
  if (will && !GEMINIPARSER_NOT_OWNERS.has(will[1])) return { owner: will[1], text };
  return { owner: null, text };
}

function geminiparserDueHint(text) {
  const m = text.match(/\b(?:due(?:\s+on|\s+by)?:?|by|before|until)\s+([^.,;()]+)/i);
  if (!m) return null;
  const hint = m[1].trim();
  return GEMINIPARSER_DATE_WORD_RE.test(hint) ? hint : null;
}

/**
 * Parse proposed action items from a Gemini notes document model.
 * @param {*} docModel see file header
 * @returns {Array<{text:string, owner:(string|null), dueHint:(string|null), sourceHeading:string, sourceOffset:number, actionHash:string}>}
 */
export function parseGeminiNotes(docModel) {
  const paras = geminiparserParagraphs(docModel);
  const proposals = [];
  const seen = new Set();
  let section = null; // heading text while inside an action section
  for (const p of paras) {
    const kind = geminiparserClassifyHeading(p);
    if (kind === 'action') { section = geminiparserHeadingText(p.text); continue; }
    if (kind === 'other') { section = null; continue; }
    if (section === null) continue;
    const isItem = p.list || GEMINIPARSER_LIST_MARKER_RE.test(p.text);
    if (!isItem) continue;
    const stripped = p.text.replace(GEMINIPARSER_CHECKBOX_RE, '').replace(GEMINIPARSER_LIST_MARKER_RE, '').trim();
    if (stripped === '') continue;
    const { owner, text } = geminiparserOwnerAndText(stripped);
    if (text === '') continue;
    const actionHash = geminiparserActionHash(text);
    if (seen.has(actionHash)) continue;
    seen.add(actionHash);
    proposals.push({ text, owner, dueHint: geminiparserDueHint(text), sourceHeading: section, sourceOffset: p.offset, actionHash });
  }
  return proposals;
}

/** Adapter base for locating and reading meeting notes for an occurrence. Unconfigured in v1. */
export class MeetingNotesProvider {
  discoverForOccurrence() {
    throw new Error('Not configured');
  }

  readProposedActions() {
    throw new Error('Not configured');
  }

  readProposedDecisions() {
    throw new Error('Not configured');
  }
}
