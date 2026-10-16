/**
 * @file gasRuntimeStubs.js
 * @description Loads the REAL gas-app/Engines.gs into a node:vm context with GAS service stubs, so
 * tests exercise the generated server code rather than a reimplementation. Pattern adapted from
 * work-request/gsa-tenant-portal-forms/tests/gas-runtime-stubs.js.
 *
 * GOTCHAS (read before extending):
 *  - Load order: .gs files share one global scope and clasp loads them alphabetically. Engines.gs
 *    is one IIFE exposing only the global `DPEngines`; load it via loadEngines(ctx) and read
 *    ctx.DPEngines. Future .gs wrappers must be loaded with loadGasFile(ctx, name) AFTER Engines.gs
 *    only if they read DPEngines at call time (never at top level; see gas-global-init-order rule).
 *  - Cross-realm: objects/arrays created inside the vm have different prototypes than host ones, so
 *    assert.deepStrictEqual (and node:assert/strict's deepEqual, which IS deepStrictEqual) fails on
 *    structurally identical values. Use toHost(value) (JSON round trip) before asserting, or the
 *    legacy loose assert.deepEqual from 'node:assert'. Object.isFrozen works across realms.
 *  - LockService: getScriptLock() returns a NEW handle each call, modelling a separate trigger
 *    execution. All handles share one lock; tryLock fails while another handle holds it.
 *  - Advanced services (Gmail/Calendar/Tasks/Docs) are minimal in-memory fakes of the call shapes
 *    only (no paging/quota/permissions). Extend them in later waves; keep shapes identical to the
 *    real REST resources.
 *  - Never put real email content in fakes.
 */
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const GAS_APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'gas-app');

function gasBytes(value) {
  return typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value);
}

/**
 * Utilities.formatDate(date, timeZone, pattern) for the SimpleDateFormat subset the server uses:
 * yyyy MM dd HH mm ss, quoted literals ('T') and punctuation. Any other pattern letter throws, so a
 * new pattern in server code fails the test instead of silently formatting wrong.
 */
export function formatDateInZone(date, tz, pattern) {
  if (!(date instanceof Date) && Object.prototype.toString.call(date) !== '[object Date]') throw new Error('formatDate: date must be a Date');
  if (Number.isNaN(date.getTime())) throw new Error('formatDate: invalid date');
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = {};
  for (const part of f.formatToParts(date)) p[part.type] = part.value;
  const tokens = { yyyy: p.year, MM: p.month, dd: p.day, HH: p.hour, mm: p.minute, ss: p.second };
  let out = '';
  for (let i = 0; i < pattern.length;) {
    const ch = pattern[i];
    if (ch === "'") {
      const end = pattern.indexOf("'", i + 1);
      if (end < 0) throw new Error(`formatDate: unterminated quote in ${pattern}`);
      out += pattern.slice(i + 1, end);
      i = end + 1;
    } else if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (pattern[j] === ch) j += 1;
      const tok = pattern.slice(i, j);
      if (!(tok in tokens)) throw new Error(`formatDate stub: unsupported pattern token ${tok} in ${pattern}`);
      out += tokens[tok];
      i = j;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

function makeUtilities() {
  return {
    formatDate: formatDateInZone,
    DigestAlgorithm: { MD5: 'md5', SHA_1: 'sha1', SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
    // Real GAS returns signed bytes (-128..127); mirror that.
    computeDigest(algorithm, value) {
      return Array.from(crypto.createHash(algorithm).update(gasBytes(value)).digest(), (b) => (b > 127 ? b - 256 : b));
    },
    base64Encode(value) { return gasBytes(value).toString('base64'); },
    base64EncodeWebSafe(value) { return gasBytes(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'); },
    base64Decode(str) { return Array.from(Buffer.from(String(str), 'base64'), (b) => (b > 127 ? b - 256 : b)); },
    getUuid() { return crypto.randomUUID(); }
  };
}

function makePropertiesService() {
  const make = () => {
    const store = new Map();
    return {
      store,
      getProperty: (k) => (store.has(k) ? store.get(k) : null),
      setProperty(k, v) { store.set(k, String(v)); return this; },
      deleteProperty(k) { store.delete(k); return this; },
      getProperties: () => Object.fromEntries(store)
    };
  };
  const script = make();
  const user = make();
  return { getScriptProperties: () => script, getUserProperties: () => user };
}

function makeLockService() {
  // Script lock and user lock are independent locks (as in Apps Script), each with its own holder.
  const make = () => {
    const state = { holder: null, nextId: 1 };
    const handle = () => {
      const id = state.nextId;
      state.nextId += 1;
      return {
        tryLock() {
          if (state.holder !== null && state.holder !== id) return false;
          state.holder = id;
          return true;
        },
        waitLock() {
          if (!this.tryLock()) throw new Error('Could not obtain lock');
        },
        hasLock: () => state.holder === id,
        releaseLock() { if (state.holder === id) state.holder = null; }
      };
    };
    return { state, handle };
  };
  const script = make();
  const user = make();
  return { state: script.state, userState: user.state, getScriptLock: script.handle, getUserLock: user.handle };
}

function makeCacheService() {
  const make = () => {
    const store = new Map();
    return {
      get: (k) => (store.has(k) ? store.get(k) : null),
      put(k, v) { store.set(k, String(v)); },
      putAll(obj) { for (const k of Object.keys(obj)) store.set(k, String(obj[k])); },
      remove(k) { store.delete(k); }
    };
  };
  const script = make();
  return { getScriptCache: () => script, getUserCache: () => make() };
}

/** In-memory fakes with the call shapes of the Advanced services. Seed via the returned `data`. */
function makeAdvancedFakes() {
  const data = { threads: {}, events: [], tasks: [], docs: {}, inaccessibleDocs: new Set(), driveFiles: [], sheets: {}, sheetsCalls: [], nextId: 1 };
  const id = (p) => { const v = `${p}${data.nextId}`; data.nextId += 1; return v; };
  const notFound = (what) => { const e = new Error(`${what} not found`); e.code = 404; return e; };
  return {
    data,
    Gmail: {
      Users: {
        getProfile() { return { emailAddress: 'tester@example.com' }; },
        Threads: {
          get(userId, threadId) { if (!data.threads[threadId]) throw notFound('thread'); return data.threads[threadId]; },
          list(userId, opts = {}) {
            const all = Object.values(data.threads).filter((t) => !opts.labelIds || (t.labelIds || []).some((l) => opts.labelIds.includes(l)));
            return { threads: all.map((t) => ({ id: t.id })) };
          }
        }
      }
    },
    Calendar: {
      Events: {
        list(calendarId) { return { items: data.events.filter((e) => !e.calendarId || e.calendarId === calendarId) }; },
        get(calendarId, eventId) {
          const e = data.events.find((x) => x.id === eventId);
          if (!e) throw notFound('event');
          return e;
        }
      }
    },
    Tasks: {
      Tasks: {
        list() { return { items: data.tasks.slice() }; },
        get(tasklist, taskId) { const t = data.tasks.find((x) => x.id === taskId); if (!t) throw notFound('task'); return t; },
        insert(task) { const t = { id: id('task'), status: 'needsAction', ...task }; data.tasks.push(t); return t; },
        patch(patch, tasklist, taskId) { const t = this.get(tasklist, taskId); Object.assign(t, patch); return t; }
      }
    },
    Docs: {
      Documents: {
        get(docId) { return docToApi(docGuard(docId)); },
        create(doc) { return docToApi(newFakeDoc((doc && doc.title) || 'Untitled')); },
        batchUpdate(body, docId) {
          const doc = docGuard(docId);
          const wc = body.writeControl;
          if (wc && wc.requiredRevisionId && wc.requiredRevisionId !== doc.revisionId) {
            const e = new Error('Precondition failed: revision mismatch'); e.code = 400; throw e;
          }
          // Atomic: apply to a copy, commit only if every request succeeds.
          const work = { ...doc, chars: doc.chars.map((c) => ({ ...c })) };
          for (const r of body.requests) applyDocRequest(work, r);
          doc.chars = work.chars;
          doc.revisionId = `rev${Number(doc.revisionId.slice(3)) + 1}`;
          doc.appliedRequests.push(...body.requests);
          return { documentId: docId };
        }
      }
    },
    Drive: {
      Files: {
        insert(resource) {
          const f = { id: id('file'), title: resource.title, mimeType: resource.mimeType, parents: resource.parents || [] };
          data.driveFiles.push(f);
          if (f.mimeType === 'application/vnd.google-apps.document') newFakeDoc(f.title, f.id);
          if (f.mimeType === 'application/vnd.google-apps.spreadsheet') {
            data.sheets[f.id] = { title: f.title, tabs: [{ sheetId: 0, title: 'Sheet1', rows: [] }], nextSheetId: 1 };
          }
          return { ...f };
        },
        // Like Drive v2: a permanently deleted file 404s; a trashed one still returns, with labels.trashed.
        get(fileId) {
          const f = data.driveFiles.find((x) => x.id === fileId);
          if (!f) { const e = new Error(`API call to drive.files.get failed with error: File not found: ${fileId}`); e.code = 404; throw e; }
          return { ...f, labels: { trashed: f.trashed === true } };
        },
        list(opts = {}) {
          const q = String(opts.q || '');
          const title = (/title = '([^']*)'/.exec(q) || [])[1];
          const mime = (/mimeType = '([^']*)'/.exec(q) || [])[1];
          const parent = (/'([^']*)' in parents/.exec(q) || [])[1];
          const items = data.driveFiles.filter((f) => (!title || f.title === title) && (!mime || f.mimeType === mime)
            && (!parent || f.parents.some((p) => p.id === parent)) && !(/trashed = false/.test(q) && f.trashed === true));
          return { items: items.map((f) => ({ ...f })) };
        }
      }
    },
    Sheets: makeSheetsFake(data)
  };

  function docGuard(docId) {
    if (data.inaccessibleDocs.has(docId)) { const e = new Error('The caller does not have permission'); e.code = 403; throw e; }
    if (!data.docs[docId]) throw notFound('document');
    return data.docs[docId];
  }
  function newFakeDoc(title, docId) {
    const did = docId || id('doc');
    // chars model the body after the leading section break; pstyle lives on each '\n'.
    const doc = { documentId: did, title, revisionId: 'rev1', chars: [{ ch: '\n', link: null, pstyle: 'NORMAL_TEXT' }], appliedRequests: [] };
    data.docs[did] = doc;
    return doc;
  }
}

/** Renders a fake doc as the Docs API resource shape (index 0 = section break, text from index 1). */
function docToApi(doc) {
  const content = [{ startIndex: 0, endIndex: 1, sectionBreak: {} }];
  let i = 0;
  while (i < doc.chars.length) {
    let j = i;
    while (doc.chars[j].ch !== '\n') j += 1;
    const elements = [];
    let k = i;
    while (k <= j) {
      const link = doc.chars[k].link;
      let m = k;
      while (m + 1 <= j && doc.chars[m + 1].link === link) m += 1;
      const text = doc.chars.slice(k, m + 1).map((c) => c.ch).join('');
      elements.push({ startIndex: k + 1, endIndex: m + 2, textRun: { content: text, textStyle: link ? { link: { url: link } } : {} } });
      k = m + 1;
    }
    content.push({ startIndex: i + 1, endIndex: j + 2, paragraph: { elements, paragraphStyle: { namedStyleType: doc.chars[j].pstyle } } });
    i = j + 1;
  }
  return { documentId: doc.documentId, title: doc.title, revisionId: doc.revisionId, body: { content } };
}

function docBad(msg) { const e = new Error(msg); e.code = 400; return e; }

/** Applies one Docs request (insertText, updateParagraphStyle, updateTextStyle, deleteContentRange, deleteParagraphBullets). */
function applyDocRequest(doc, r) {
  const n = doc.chars.length;
  if (r.insertText) {
    const { index } = r.insertText.location;
    if (index < 1 || index > n) throw docBad(`insertText index ${index} out of range 1..${n}`);
    // Real Docs: inserted text inherits char style from its neighbour and paragraph style from the
    // paragraph it lands in. Callers must restyle explicitly.
    let nl = index - 1;
    while (doc.chars[nl].ch !== '\n') nl += 1;
    const pstyle = doc.chars[nl].pstyle;
    const inheritLink = index >= 2 ? doc.chars[index - 2].link : null;
    const units = [];
    for (let u = 0; u < r.insertText.text.length; u += 1) {
      const ch = r.insertText.text[u]; // UTF-16 unit, matching Docs index arithmetic
      units.push({ ch, link: inheritLink, pstyle: ch === '\n' ? pstyle : undefined });
    }
    doc.chars.splice(index - 1, 0, ...units);
  } else if (r.updateParagraphStyle) {
    const { startIndex, endIndex } = r.updateParagraphStyle.range;
    if (startIndex < 1 || endIndex > n + 1 || startIndex >= endIndex) throw docBad('updateParagraphStyle range invalid');
    // Every paragraph overlapping [startIndex, endIndex) is styled; its style lives on its newline.
    for (let p = startIndex - 1; p < endIndex - 1; p += 1) {
      let q = p;
      while (doc.chars[q].ch !== '\n') q += 1;
      doc.chars[q].pstyle = r.updateParagraphStyle.paragraphStyle.namedStyleType;
    }
  } else if (r.updateTextStyle) {
    const { startIndex, endIndex } = r.updateTextStyle.range;
    if (startIndex < 1 || endIndex > n + 1 || startIndex >= endIndex) throw docBad('updateTextStyle range invalid');
    const url = r.updateTextStyle.textStyle && r.updateTextStyle.textStyle.link ? r.updateTextStyle.textStyle.link.url : null;
    if (String(r.updateTextStyle.fields).split(',').includes('link')) {
      for (let p = startIndex; p < endIndex; p += 1) doc.chars[p - 1].link = url;
    }
  } else if (r.deleteContentRange) {
    // Real Docs refuses to delete the body's final newline (index n).
    const { startIndex, endIndex } = r.deleteContentRange.range;
    if (startIndex < 1 || endIndex > n || startIndex >= endIndex) throw docBad('deleteContentRange range invalid');
    doc.chars.splice(startIndex - 1, endIndex - startIndex);
  } else if (!r.deleteParagraphBullets) {
    throw docBad(`unsupported fake Docs request: ${Object.keys(r).join(',')}`);
  }
}

/** Plain text of a fake doc (for assertions). */
export function fakeDocText(doc) { return doc.chars.map((c) => c.ch).join(''); }

/** Paragraphs [{text, style, links:[{start,end,url}]}] of a fake doc (for assertions). */
export function fakeDocParagraphs(doc) {
  const out = [];
  let cur = [];
  for (const c of doc.chars) {
    if (c.ch === '\n') {
      const links = [];
      cur.forEach((x, i) => {
        if (!x.link) return;
        const last = links[links.length - 1];
        if (last && last.url === x.link && last.end === i) last.end = i + 1;
        else links.push({ start: i, end: i + 1, url: x.link });
      });
      out.push({ text: cur.map((x) => x.ch).join(''), style: c.pstyle, links });
      cur = [];
    } else cur.push(c);
  }
  return out;
}

/**
 * Minimal in-memory Advanced Sheets v4 fake. Supports Spreadsheets.get/batchUpdate (addSheet,
 * updateSheetProperties title) and Spreadsheets.Values.get/batchGet/update/batchUpdate/append with
 * A1 ranges. `data.sheetsCalls` logs every call ({method, ...}) so tests can assert batching.
 */
function makeSheetsFake(data) {
  const log = (method, extra = {}) => data.sheetsCalls.push({ method, ...extra });
  const sheet = (sid) => {
    if (!data.sheets[sid]) { const e = new Error('Requested entity was not found.'); e.code = 404; throw e; }
    return data.sheets[sid];
  };
  const colNum = (s) => [...s].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
  const colLetter = (n) => { let s = ''; for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s; return s; };
  function parseRange(range) {
    const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(range);
    if (!m) throw new Error(`fake Sheets: unsupported range ${range}`);
    const tab = (m[1] || m[2]).replace(/''/g, "'");
    const a = /^([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/.exec(m[3]);
    if (!a) throw new Error(`fake Sheets: unsupported A1 ${m[3]}`);
    return {
      tab,
      c1: colNum(a[1]),
      r1: a[2] ? Number(a[2]) : 1,
      c2: a[3] ? colNum(a[3]) : colNum(a[1]),
      r2: a[4] ? Number(a[4]) : (a[3] ? Infinity : (a[2] ? Number(a[2]) : Infinity))
    };
  }
  const tabOf = (sp, name) => {
    const t = sp.tabs.find((x) => x.title === name);
    if (!t) throw new Error(`Unable to parse range: ${name}`);
    return t;
  };
  function readRange(sp, range) {
    const { tab, c1, r1, c2, r2 } = parseRange(range);
    const t = tabOf(sp, tab);
    const out = [];
    for (let r = r1; r <= Math.min(r2, t.rows.length); r += 1) {
      const row = [];
      for (let c = c1; c <= c2; c += 1) row.push((t.rows[r - 1] || [])[c - 1] === undefined ? '' : t.rows[r - 1][c - 1]);
      while (row.length && row[row.length - 1] === '') row.pop();
      out.push(row);
    }
    while (out.length && out[out.length - 1].length === 0) out.pop();
    return out;
  }
  function writeValues(sp, range, values) {
    const { tab, c1, r1 } = parseRange(range);
    const t = tabOf(sp, tab);
    values.forEach((vals, i) => {
      const r = r1 + i;
      while (t.rows.length < r) t.rows.push([]);
      vals.forEach((v, j) => {
        const row = t.rows[r - 1];
        while (row.length < c1 + j) row.push('');
        row[c1 + j - 1] = v;
      });
    });
  }
  const lastDataRow = (t) => {
    let last = 0;
    t.rows.forEach((row, i) => { if (row.some((c) => c !== '' && c !== undefined)) last = i + 1; });
    return last;
  };
  return {
    Spreadsheets: {
      get(sid) {
        log('spreadsheets.get');
        const sp = sheet(sid);
        return { spreadsheetId: sid, sheets: sp.tabs.map((t) => ({ properties: { sheetId: t.sheetId, title: t.title } })) };
      },
      batchUpdate(body, sid) {
        log('spreadsheets.batchUpdate', { requests: body.requests.length });
        const sp = sheet(sid);
        for (const r of body.requests) {
          if (r.addSheet) {
            const title = r.addSheet.properties.title;
            if (sp.tabs.some((t) => t.title === title)) throw new Error(`A sheet with the name "${title}" already exists.`);
            sp.tabs.push({ sheetId: sp.nextSheetId, title, rows: [] });
            sp.nextSheetId += 1;
          } else if (r.updateSheetProperties) {
            const p = r.updateSheetProperties.properties;
            const t = sp.tabs.find((x) => x.sheetId === p.sheetId);
            if (!t) throw new Error('fake Sheets: unknown sheetId');
            if (String(r.updateSheetProperties.fields).includes('title')) t.title = p.title;
          } else if (r.setDataValidation) {
            log('setDataValidation', { range: r.setDataValidation.range, type: r.setDataValidation.rule.condition.type });
          } else throw new Error(`fake Sheets: unsupported request ${Object.keys(r).join(',')}`);
        }
        return { spreadsheetId: sid };
      },
      Values: {
        get(sid, range) { log('values.get', { range }); return { range, values: readRange(sheet(sid), range) }; },
        batchGet(sid, opts) {
          log('values.batchGet', { ranges: opts.ranges });
          const sp = sheet(sid);
          return { valueRanges: opts.ranges.map((range) => ({ range, values: readRange(sp, range) })) };
        },
        update(resource, sid, range, opts = {}) {
          log('values.update', { range, valueInputOption: opts.valueInputOption });
          writeValues(sheet(sid), range, resource.values);
          return { updatedRows: resource.values.length };
        },
        batchUpdate(body, sid) {
          log('values.batchUpdate', { ranges: body.data.map((d) => d.range), valueInputOption: body.valueInputOption });
          const sp = sheet(sid);
          body.data.forEach((d) => writeValues(sp, d.range, d.values));
          return { totalUpdatedRows: body.data.reduce((n, d) => n + d.values.length, 0) };
        },
        append(resource, sid, range, opts = {}) {
          log('values.append', { range, rows: resource.values.length, valueInputOption: opts.valueInputOption });
          const sp = sheet(sid);
          const { tab, c1 } = parseRange(range);
          const t = tabOf(sp, tab);
          writeValues(sp, `'${tab}'!${colLetter(c1)}${lastDataRow(t) + 1}`, resource.values);
          return { updates: { updatedRows: resource.values.length } };
        }
      }
    }
  };
}

/**
 * Creates a fresh vm context with GAS stubs. Fresh state per call.
 * @returns {object} context (also exposes ctx.__fakes for seeding Advanced-service data)
 */
export function makeGasContext() {
  const fakes = makeAdvancedFakes();
  const lines = [];
  const context = {
    Utilities: makeUtilities(),
    PropertiesService: makePropertiesService(),
    LockService: makeLockService(),
    CacheService: makeCacheService(),
    Gmail: fakes.Gmail,
    Calendar: fakes.Calendar,
    Tasks: fakes.Tasks,
    Docs: fakes.Docs,
    Drive: fakes.Drive,
    Sheets: fakes.Sheets,
    Session: { getScriptTimeZone: () => 'America/New_York', getActiveUser: () => ({ getEmail: () => 'tester@example.com' }), getEffectiveUser: () => ({ getEmail: () => 'tester@example.com' }) },
    console: { log: (...a) => lines.push(a.join(' ')), warn: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push(a.join(' ')) },
    __fakes: fakes.data,
    __consoleLines: lines
  };
  vm.createContext(context);
  return context;
}

/** Runs gas-app/<fileName> in the context. */
export function loadGasFile(context, fileName) {
  const source = fs.readFileSync(path.join(GAS_APP_DIR, fileName), 'utf8');
  vm.runInContext(source, context, { filename: fileName });
  return context;
}

/** Loads the generated Engines.gs and returns the frozen DPEngines namespace. */
export function loadEngines(context) {
  loadGasFile(context, 'Engines.gs');
  return context.DPEngines;
}

/** JSON round-trip into host-realm plain data, safe for assert.deepStrictEqual. */
export function toHost(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
