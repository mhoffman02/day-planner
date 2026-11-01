/**
 * @file NotesRepository.gs
 * @description App-owned "Meeting Notes - <DisplayName>" Google Docs (Phase 28, spec section 8) via
 * the Docs Advanced Service under drive.file (Docs.Documents.get/batchUpdate; Drive.Files.insert to
 * create inside the Day Planner folder). Translates the paragraph-index requests of the pure
 * DPEngines notesPlanner into Docs API requests with UTF-16 character indices computed from a FRESH
 * document fetch on every call, and applies them in a single atomic batchUpdate guarded by the
 * document revision (no partial writes). An inaccessible Doc throws a retryable DOC_INACCESSIBLE
 * error before anything is written.
 *
 * Notes: model paragraphs carry no `sig` (a hash cannot live in Doc text); the planner de-duplicates
 * carry-ins by their Gmail link, which readDocModel reconstructs from link runs. Message bodies are
 * never read or logged here.
 *
 * Wrapped in one IIFE (gas-namespace-iife rule); the only global created is `DPNotesRepo`, used by
 * other .gs files. Reads DPConfig/DPEngines lazily at call time (gas-global-init-order rule).
 */
(function(global) {

const MIME_DOC = 'application/vnd.google-apps.document';
const NOTES_TITLE_PREFIX = 'Meeting Notes – ';
const READ_FIELDS = 'revisionId,body.content(startIndex,endIndex,paragraph(paragraphStyle.namedStyleType,elements(startIndex,endIndex,textRun(content,textStyle.link.url))))';

function docError_(code, message, retryable, cause) {
  const e = new Error(message);
  e.code = code;
  e.retryable = retryable;
  if (cause) e.cause = cause;
  return e;
}

function isAccessError_(err) {
  const c = err && (err.code || (err.details && err.details.code));
  if (c === 403 || c === 404) return true;
  return /permission|not found|forbidden|404|403/i.test(String(err && err.message));
}

function fetchDoc_(docId) {
  try {
    return Docs.Documents.get(docId, { fields: READ_FIELDS });
  } catch (err) {
    if (isAccessError_(err)) throw docError_('DOC_INACCESSIBLE', 'Notes Doc is inaccessible: ' + String(err.message), true, err);
    throw err;
  }
}

function styleOut_(named) { return named === 'NORMAL_TEXT' || !named ? 'NORMAL' : named; }
function styleIn_(style) { return style === 'NORMAL' || !style ? 'NORMAL_TEXT' : style; }

/** Converts a Docs resource into the planner model (+ start/end indices and revisionId). */
function toModel_(docId, doc) {
  const content = (doc.body && doc.body.content) || [];
  const paragraphs = [];
  content.forEach(function (el) {
    if (!el.paragraph) return;
    let text = '';
    const links = [];
    (el.paragraph.elements || []).forEach(function (pe) {
      if (!pe.textRun) return;
      const chunk = String(pe.textRun.content || '');
      const url = pe.textRun.textStyle && pe.textRun.textStyle.link && pe.textRun.textStyle.link.url;
      const chunkNoNl = chunk.replace(/\n$/, '');
      if (url && chunkNoNl.length) links.push({ start: text.length, end: text.length + chunkNoNl.length, url: url });
      text += chunkNoNl;
    });
    const p = { text: text, style: styleOut_(el.paragraph.paragraphStyle && el.paragraph.paragraphStyle.namedStyleType), start: el.startIndex, end: el.endIndex };
    if (links.length) p.links = links;
    paragraphs.push(p);
  });
  return { docId: docId, accessible: true, revisionId: doc.revisionId || '', paragraphs: paragraphs };
}

/**
 * @param {string} docId
 * @returns {{docId:string, accessible:boolean, revisionId:string, paragraphs:Array<Object>}} Planner model.
 * @throws {Error} code DOC_INACCESSIBLE (retryable) if the Doc cannot be read.
 */
function readDocModel(docId) {
  if (!docId) throw new Error('docId is required');
  return toModel_(docId, fetchDoc_(docId));
}

/**
 * Translates planner INSERT_PARAGRAPHS requests (paragraph indices, each relative to the state after
 * the previous request) into Docs API requests. Pure; exposed to tests through applyPlan only.
 * Inserting before paragraph k < n goes at that paragraph start; appending after the last
 * paragraph goes before the final newline, as "\n" + joined text, so the document stays valid.
 */
function translate_(model, requests) {
  const tracked = model.paragraphs.map(function (p) { return { start: p.start, len: p.text.length }; });
  const out = [];
  requests.forEach(function (req) {
    if (req.type !== 'INSERT_PARAGRAPHS') throw new Error('NotesRepository: unsupported planner request ' + String(req.type));
    const n = tracked.length;
    const k = req.beforeIndex;
    const paras = req.paragraphs;
    if (!paras.length) return;
    if (k < 0 || k > n || n === 0) throw new Error('NotesRepository: beforeIndex ' + k + ' out of range 0..' + n);
    let at;
    let text;
    let firstStart;
    if (k < n) {
      at = tracked[k].start;
      text = paras.map(function (p) { return p.text + '\n'; }).join('');
      firstStart = at;
    } else {
      at = tracked[n - 1].start + tracked[n - 1].len; // index of the last paragraph final newline
      text = '\n' + paras.map(function (p) { return p.text; }).join('\n');
      firstStart = at + 1;
    }
    out.push({ insertText: { location: { index: at }, text: text } });

    const added = [];
    let cursor = firstStart;
    paras.forEach(function (p) {
      added.push({ start: cursor, len: p.text.length, para: p });
      cursor += p.text.length + 1;
    });
    // Explicit reset on every inserted paragraph: Docs lets new text inherit the neighbouring
    // paragraph style, bullets and character style (incl. links).
    const rangeStart = added[0].start;
    const rangeEnd = added[added.length - 1].start + added[added.length - 1].len + 1;
    out.push({ deleteParagraphBullets: { range: { startIndex: rangeStart, endIndex: rangeEnd } } });
    added.forEach(function (a) {
      out.push({
        updateParagraphStyle: {
          range: { startIndex: a.start, endIndex: a.start + a.len + 1 },
          paragraphStyle: { namedStyleType: styleIn_(a.para.style) },
          fields: 'namedStyleType'
        }
      });
      if (a.len > 0) {
        out.push({
          updateTextStyle: { range: { startIndex: a.start, endIndex: a.start + a.len }, textStyle: {}, fields: 'link,bold,italic,underline' }
        });
      }
      (a.para.links || []).forEach(function (l) {
        out.push({
          updateTextStyle: {
            range: { startIndex: a.start + l.start, endIndex: a.start + l.end },
            textStyle: { link: { url: l.url } },
            fields: 'link'
          }
        });
      });
    });

    const inserted = text.length;
    const insertedTracked = added.map(function (a) { return { start: a.start, len: a.len }; });
    if (k < n) {
      for (let i = k; i < n; i++) tracked[i].start += inserted;
      tracked.splice.apply(tracked, [k, 0].concat(insertedTracked));
    } else {
      tracked.push.apply(tracked, insertedTracked);
    }
  });
  return out;
}

/**
 * Applies a planner result (an object with `requests`, or the array itself) to the Doc in ONE
 * atomic batchUpdate. Indices come from a fresh fetch; if `plan.baseRevisionId` (the revisionId of
 * the model the plan was made from) no longer matches, throws retryable DOC_CONFLICT before writing.
 * @param {string} docId
 * @param {{requests:Array<Object>, baseRevisionId?:string}|Array<Object>} plan
 * @returns {{applied:number, revisionId:string}} Number of Docs requests sent.
 */
function applyPlan(docId, plan) {
  const requests = Array.isArray(plan) ? plan : (plan && plan.requests) || [];
  const fresh = fetchDoc_(docId);
  if (!requests.length) return { applied: 0, revisionId: fresh.revisionId || '' };
  if (plan && plan.baseRevisionId && fresh.revisionId && plan.baseRevisionId !== fresh.revisionId) {
    throw docError_('DOC_CONFLICT', 'Notes Doc changed since the plan was made; re-read and re-plan', true);
  }
  const docsRequests = translate_(toModel_(docId, fresh), requests);
  const body = { requests: docsRequests };
  if (fresh.revisionId) body.writeControl = { requiredRevisionId: fresh.revisionId };
  try {
    Docs.Documents.batchUpdate(body, docId);
  } catch (err) {
    if (isAccessError_(err)) throw docError_('DOC_INACCESSIBLE', 'Notes Doc is inaccessible: ' + String(err.message), true, err);
    throw docError_('DOC_WRITE_FAILED', 'Notes Doc update failed (nothing was written): ' + String(err.message), true, err);
  }
  return { applied: docsRequests.length, revisionId: fresh.revisionId || '' };
}

/**
 * Count of carry-in bullets under PREP / EMAIL CARRY-INS for one occurrence.
 * @param {string} docId
 * @param {{date:string, displayName:string}} occurrence The planner occurrence (the heading is
 *   "<date> - <DisplayName>", so an occurrenceId string alone cannot locate the block).
 * @returns {number}
 */
function carryInCount(docId, occurrence) {
  if (!occurrence || typeof occurrence !== 'object') {
    throw new Error('carryInCount needs the occurrence object {date, displayName}; an occurrenceId alone cannot locate its block');
  }
  return global.DPEngines.carryInCount(readDocModel(docId), occurrence);
}

function findNotesDocInFolder_(folderId, title) {
  const q = "title = '" + title.replace(/'/g, "\\'") + "' and mimeType = '" + MIME_DOC + "' and '" + folderId + "' in parents and trashed = false";
  const res = Drive.Files.list({ q: q, maxResults: 1 });
  return res && res.items && res.items.length ? res.items[0].id : null;
}

/**
 * Returns the notes Doc id for a registry series, creating the app-owned
 * "Meeting Notes - <DisplayName>" Doc in the Day Planner folder (or adopting one of that name left
 * by a crash) and recording the id in the registry HumanNotesDocId cell. Idempotent. Caller should
 * hold the script lock when several triggers could race.
 * @param {string} seriesKey
 * @returns {string} Doc id.
 */
function ensureNotesDoc(seriesKey) {
  const series = global.DPConfig.getRegistry().filter(function (r) { return r.SeriesKey === seriesKey; })[0];
  if (!series) throw new Error('SETUP_ERROR: SeriesKey ' + String(seriesKey) + ' not found in the Meeting Registry tab');
  if (series.HumanNotesDocId) return series.HumanNotesDocId;
  const folderId = global.DPConfig.getFolderId();
  const title = NOTES_TITLE_PREFIX + series.DisplayName;
  let docId = findNotesDocInFolder_(folderId, title);
  if (!docId) {
    const created = Drive.Files.insert({ title: title, mimeType: MIME_DOC, parents: [{ id: folderId }] });
    if (!created || !created.id) throw new Error('Notes Doc creation returned no id');
    docId = created.id;
  }
  global.DPConfig.setRegistryDocId(seriesKey, docId);
  return docId;
}

// used by other .gs files (queue/trigger code); not a google.script.run surface.
global.DPNotesRepo = Object.freeze({
  ensureNotesDoc: ensureNotesDoc,
  readDocModel: readDocModel,
  applyPlan: applyPlan,
  carryInCount: carryInCount
});

})(this);
