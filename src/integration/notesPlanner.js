/**
 * @file notesPlanner.js
 * @description Pure planner for the app-owned meeting-notes Doc (Phase 28, spec section 8).
 * Input is a simplified document model {paragraphs:[{text, style, links?, sig?}]}; output is
 * requests-as-data. Request paragraph indices refer to the document state AFTER all earlier
 * requests in the same list were applied (the Docs executor translates them to character indices).
 * Carry-ins are pointers only (subject, sender, date, Gmail link, optional capped excerpt): the
 * message body is never accepted. Re-planning against the updated model is idempotent.
 */

export const NOTES_SECTIONS = Object.freeze([
  'PREP / EMAIL CARRY-INS', 'AGENDA', 'HUMAN NOTES', 'DECISIONS', 'ACTION ITEMS', 'GEMINI RECONCILIATION'
]);

const NOTES_PLANNER_DATE_HEADING_RE = /^\d{4}-\d{2}-\d{2} — /;
const NOTES_PLANNER_BODY_FIELDS = ['body', 'bodyText', 'plainBody', 'htmlBody', 'messageBody', 'html'];
const NOTES_PLANNER_DEFAULT_EXCERPT = 160;
const NOTES_PLANNER_MAX_LINE = 200;
const NOTES_PLANNER_DEFAULT_KIND = 'Decision/Input needed';

function notesPlannerError(code, message, retryable) {
  const e = new Error(message);
  e.code = code;
  e.retryable = retryable;
  return e;
}

function notesPlannerAssertDoc(doc) {
  if (!doc || doc.accessible === false || !Array.isArray(doc.paragraphs)) {
    throw notesPlannerError('DOC_INACCESSIBLE', 'Notes Doc is inaccessible; no changes were planned', true);
  }
}

/**
 * Occurrence heading text: "<YYYY-MM-DD> — <DisplayName>".
 * @param {{date:string, displayName:string}} occurrence
 * @returns {string}
 */
export function notesPlannerHeadingText(occurrence) {
  if (!occurrence || !/^\d{4}-\d{2}-\d{2}$/.test(String(occurrence.date)) || !occurrence.displayName) {
    throw new Error('notesPlanner: occurrence needs date (YYYY-MM-DD) and displayName');
  }
  return `${occurrence.date} — ${occurrence.displayName}`;
}

function notesPlannerHash(str) {
  // cyrb53: small, synchronous, identical in node and Apps Script V8.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, '0');
}

function notesPlannerOneLine(value, max) {
  const s = String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function notesPlannerClone(doc) {
  return { ...doc, paragraphs: doc.paragraphs.map((p) => ({ ...p })) };
}

/**
 * Applies planner requests to a document model (pure; used by tests and dry-run previews).
 * @param {{paragraphs:Array<object>}} doc
 * @param {Array<object>} requests
 * @returns {{paragraphs:Array<object>}} new model
 */
export function applyNotesRequests(doc, requests) {
  const out = notesPlannerClone(doc);
  for (const r of requests) {
    if (r.type !== 'INSERT_PARAGRAPHS') throw new Error(`notesPlanner: unknown request type ${String(r.type)}`);
    if (r.beforeIndex < 0 || r.beforeIndex > out.paragraphs.length) {
      throw new Error(`notesPlanner: beforeIndex ${r.beforeIndex} out of range`);
    }
    out.paragraphs.splice(r.beforeIndex, 0, ...r.paragraphs.map((p) => ({ ...p })));
  }
  return out;
}

function notesPlannerFindBlock(doc, occurrence) {
  const heading = notesPlannerHeadingText(occurrence);
  const start = doc.paragraphs.findIndex((p) => String(p.text).trim() === heading);
  if (start === -1) return null;
  let end = doc.paragraphs.length;
  for (let i = start + 1; i < doc.paragraphs.length; i += 1) {
    const p = doc.paragraphs[i];
    if (p.style === 'HEADING_1' || p.style === 'HEADING_2' || NOTES_PLANNER_DATE_HEADING_RE.test(String(p.text))) {
      end = i;
      break;
    }
  }
  const sections = {};
  for (let i = start + 1; i < end; i += 1) {
    const t = String(doc.paragraphs[i].text).trim();
    if (NOTES_SECTIONS.includes(t) && sections[t] === undefined) sections[t] = i;
  }
  return { start, end, sections };
}

function notesPlannerSkeleton(occurrence, sections) {
  const ps = [];
  if (occurrence) ps.push({ text: notesPlannerHeadingText(occurrence), style: 'HEADING_2' });
  for (const s of sections) {
    ps.push({ text: s, style: 'HEADING_3' }, { text: '', style: 'NORMAL' });
  }
  return ps;
}

/**
 * Plans what is needed so the occurrence heading and all six subsections exist.
 * @param {{paragraphs:Array<object>}|null} docModel
 * @param {{occurrenceId?:string, date:string, displayName:string}} occurrence
 * @returns {{status:'EXISTS'|'CREATE_SKELETON'|'ADD_SUBSECTIONS', missing:string[], requests:Array<object>}}
 */
export function planOccurrenceSection(docModel, occurrence) {
  notesPlannerAssertDoc(docModel);
  const block = notesPlannerFindBlock(docModel, occurrence);
  if (!block) {
    return {
      status: 'CREATE_SKELETON',
      missing: [...NOTES_SECTIONS],
      requests: [{ type: 'INSERT_PARAGRAPHS', beforeIndex: docModel.paragraphs.length, paragraphs: notesPlannerSkeleton(occurrence, NOTES_SECTIONS) }]
    };
  }
  const missing = NOTES_SECTIONS.filter((s) => block.sections[s] === undefined);
  if (missing.length === 0) return { status: 'EXISTS', missing: [], requests: [] };
  const requests = [];
  let working = docModel;
  for (const s of missing) {
    const b = notesPlannerFindBlock(working, occurrence);
    const next = NOTES_SECTIONS.slice(NOTES_SECTIONS.indexOf(s) + 1).find((n) => b.sections[n] !== undefined);
    const req = {
      type: 'INSERT_PARAGRAPHS',
      beforeIndex: next === undefined ? b.end : b.sections[next],
      paragraphs: notesPlannerSkeleton(null, [s])
    };
    requests.push(req);
    working = applyNotesRequests(working, [req]);
  }
  return { status: 'ADD_SUBSECTIONS', missing, requests };
}

function notesPlannerValidateCarryIn(carryIn) {
  if (!carryIn || typeof carryIn !== 'object') throw new Error('notesPlanner: carryIn is required');
  for (const f of NOTES_PLANNER_BODY_FIELDS) {
    if (carryIn[f] !== undefined) {
      throw new Error(`notesPlanner: carry-ins are pointer-only; refusing field "${f}"`);
    }
  }
  for (const f of ['threadId', 'subject', 'gmailUrl']) {
    if (typeof carryIn[f] !== 'string' || carryIn[f].trim() === '') throw new Error(`notesPlanner: carryIn.${f} is required`);
  }
}

function notesPlannerCarryInParagraphs(carryIn, signature, maxExcerpt) {
  const kind = notesPlannerOneLine(carryIn.kind || NOTES_PLANNER_DEFAULT_KIND, 60);
  const framing = notesPlannerOneLine(carryIn.framing, NOTES_PLANNER_MAX_LINE);
  const subject = notesPlannerOneLine(carryIn.subject, NOTES_PLANNER_MAX_LINE);
  const first = `• [${kind}] ${framing ? `${framing} — ` : ''}${subject}`;
  const from = notesPlannerOneLine(carryIn.fromName || 'Unknown sender', 80);
  const received = notesPlannerOneLine(carryIn.receivedDate || 'unknown date', 40);
  const prefix = `  From: ${from} | Received: ${received} | `;
  const ps = [
    { text: first, style: 'NORMAL', sig: signature },
    { text: `${prefix}Gmail`, style: 'NORMAL', links: [{ start: prefix.length, end: prefix.length + 5, url: carryIn.gmailUrl }] }
  ];
  if (carryIn.excerpt) {
    ps.push({ text: `  “${notesPlannerOneLine(carryIn.excerpt, maxExcerpt)}”`, style: 'NORMAL' });
  }
  return ps;
}

/**
 * Plans appending one carry-in under PREP / EMAIL CARRY-INS (creating skeleton parts as needed).
 * @param {{paragraphs:Array<object>}|null} docModel
 * @param {{occurrenceId:string, date:string, displayName:string}} occurrence
 * @param {{threadId:string, subject:string, gmailUrl:string, kind?:string, framing?:string, fromName?:string, receivedDate?:string, excerpt?:string}} carryIn
 * @param {{maxExcerpt?:number}} [opts]
 * @returns {{action:'APPEND'|'ALREADY_PRESENT', signature:string, requests:Array<object>, structure:string}}
 */
export function planCarryIn(docModel, occurrence, carryIn, opts = {}) {
  notesPlannerAssertDoc(docModel);
  notesPlannerValidateCarryIn(carryIn);
  const maxExcerpt = opts.maxExcerpt === undefined ? NOTES_PLANNER_DEFAULT_EXCERPT : opts.maxExcerpt;
  if (typeof occurrence.occurrenceId !== 'string' || occurrence.occurrenceId === '') {
    throw new Error('notesPlanner: occurrence.occurrenceId is required for carry-ins');
  }
  const probe = notesPlannerCarryInParagraphs(carryIn, '', maxExcerpt);
  const signature = notesPlannerHash(`${carryIn.threadId}|${occurrence.occurrenceId}|${probe[0].text}`);

  const structure = planOccurrenceSection(docModel, occurrence);
  const requests = [...structure.requests];
  const working = applyNotesRequests(docModel, requests);
  const block = notesPlannerFindBlock(working, occurrence);
  const prepIdx = block.sections[NOTES_SECTIONS[0]];

  const already = working.paragraphs.slice(block.start, block.end).some((p) => p.sig === signature
    || (p.links || []).some((l) => l.url === carryIn.gmailUrl));
  if (already) return { action: 'ALREADY_PRESENT', signature, requests: [], structure: 'EXISTS' };

  const nextSection = NOTES_SECTIONS.slice(1).map((s) => block.sections[s]).find((i) => i !== undefined);
  const sectionEnd = nextSection === undefined ? block.end : nextSection;
  let insertAt = prepIdx + 1;
  for (let i = prepIdx + 1; i < sectionEnd; i += 1) {
    if (String(working.paragraphs[i].text).trim() !== '') insertAt = i + 1;
  }
  requests.push({
    type: 'INSERT_PARAGRAPHS',
    beforeIndex: insertAt,
    paragraphs: notesPlannerCarryInParagraphs(carryIn, signature, maxExcerpt)
  });
  return { action: 'APPEND', signature, requests, structure: structure.status };
}

/**
 * Number of carry-in entries currently under PREP / EMAIL CARRY-INS for an occurrence.
 * @param {{paragraphs:Array<object>}|null} docModel
 * @param {{date:string, displayName:string}} occurrence
 * @returns {number}
 */
export function carryInCount(docModel, occurrence) {
  if (!docModel || !Array.isArray(docModel.paragraphs)) return 0;
  const block = notesPlannerFindBlock(docModel, occurrence);
  if (!block || block.sections[NOTES_SECTIONS[0]] === undefined) return 0;
  const prep = block.sections[NOTES_SECTIONS[0]];
  const next = NOTES_SECTIONS.slice(1).map((s) => block.sections[s]).find((i) => i !== undefined);
  const end = next === undefined ? block.end : next;
  let n = 0;
  for (let i = prep + 1; i < end; i += 1) {
    if (String(docModel.paragraphs[i].text).startsWith('•')) n += 1;
  }
  return n;
}
