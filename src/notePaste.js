/**
 * @file notePaste.js
 * @description Converts clipboard content (text/html from Gmail, Google Docs or Gemini, or
 * multi-line text/plain) into Notes card lines: one line per paragraph, using the card line
 * format (- bullets, 1. numbers, checkbox glyphs, **bold**, *italic*, __underline__, ~~strike~~,
 * [[link:URL]]text[[/link]]). Pure string work, no DOM, so it runs in node tests.
 * Mirrored verbatim into gas-app/Script.html (tests/notePaste.test.js runs both copies).
 * Comment prose here avoids apostrophes, backticks and double slashes (GAS HtmlService
 * truncation, see gas-html-safe-chars).
 */

const NOTE_PASTE_BLOCK_TAGS = new Set([
  'p', 'div', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'table',
  'blockquote', 'pre', 'section', 'article', 'header', 'footer', 'dt', 'dd', 'hr'
]);
const NOTE_PASTE_VOID_TAGS = new Set(['br', 'img', 'meta', 'link', 'hr', 'input', 'col', 'wbr']);
const NOTE_PASTE_SAFE_HREF = /^(?:https?|mailto):[^\s\]]+$/i;
const NOTE_PASTE_LIST_LINE = /^(?:- |\d+\. |[☐☒☑] )/;

function notePasteDecode(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\u0027', nbsp: ' ' };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ent) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return m;
      return code === 160 ? ' ' : String.fromCodePoint(code);
    }
    const v = named[ent.toLowerCase()];
    return v === undefined ? m : v;
  });
}

function notePasteAttr(attrs, name) {
  const re = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\u0027([^\u0027]*)\u0027|([^\\s>]+))', 'i');
  const m = re.exec(attrs || '');
  if (!m) return null;
  return notePasteDecode(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]));
}

/* Formatting flags an element sets (true/false) or leaves inherited (undefined). */
function notePasteElementFormat(tag, attrs) {
  const f = {};
  if (tag === 'b' || tag === 'strong') f.b = true;
  if (tag === 'i' || tag === 'em') f.i = true;
  if (tag === 'u' || tag === 'ins') f.u = true;
  if (tag === 's' || tag === 'strike' || tag === 'del') f.s = true;
  if (/^h[1-6]$/.test(tag)) f.b = true;
  const style = (notePasteAttr(attrs, 'style') || '').toLowerCase();
  if (style) {
    const fw = /font-weight\s*:\s*([a-z0-9]+)/.exec(style);
    if (fw) f.b = fw[1] === 'bold' || fw[1] === 'bolder' || (/^\d+$/.test(fw[1]) && parseInt(fw[1], 10) >= 600);
    const fs = /font-style\s*:\s*([a-z]+)/.exec(style);
    if (fs) f.i = fs[1] === 'italic' || fs[1] === 'oblique';
    const td = /text-decoration(?:-line)?\s*:\s*([^;]+)/.exec(style);
    if (td) {
      if (/underline/.test(td[1])) f.u = true;
      if (/line-through/.test(td[1])) f.s = true;
    }
  }
  if (tag === 'a') {
    const href = (notePasteAttr(attrs, 'href') || '').trim();
    f.href = NOTE_PASTE_SAFE_HREF.test(href) ? href : null;
  }
  return f;
}

/* Wraps one run of same-format text in markers, keeping edge spaces outside the markers. */
function notePasteWrapRun(run) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(run.text);
  let core = m[2];
  if (!core) return run.text;
  if (run.href) core = core === run.href ? core : '[[link:' + run.href + ']]' + core + '[[/link]]';
  if (run.s) core = '~~' + core + '~~';
  if (run.u) core = '__' + core + '__';
  if (run.i) core = '*' + core + '*';
  if (run.b) core = '**' + core + '**';
  return m[1] + core + m[3];
}

function notePasteRunsToLine(runs) {
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && last.b === r.b && last.i === r.i && last.u === r.u && last.s === r.s && last.href === r.href) {
      last.text += r.text;
    } else {
      merged.push({ ...r });
    }
  }
  return merged.map(notePasteWrapRun).join('').replace(/\s+/g, ' ').trim();
}

/* A pasted markdown heading would become a new topic card (###) or be stripped; make it bold. */
function notePasteNormalizeLine(line) {
  const h = /^#{1,6}\s+(.*)$/.exec(line);
  if (h) return h[1].trim() ? '**' + h[1].trim().replace(/^\*\*(.*)\*\*$/, '$1') + '**' : '';
  return line;
}

function notePasteTidy(lines) {
  const out = [];
  for (const raw of lines) {
    const line = notePasteNormalizeLine(raw.replace(/\s+$/, ''));
    if (!line.trim() && (out.length === 0 || !out[out.length - 1].trim())) continue;
    out.push(line);
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out;
}

function notePasteHtmlToLines(html) {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head|title|template)\b[\s\S]*?<\/\1\s*>/gi, '');
  const lines = [];
  const stack = [];
  const lists = [];
  let runs = [];
  let prefix = '';

  const current = () => {
    const f = { b: false, i: false, u: false, s: false, href: null };
    for (const el of stack) {
      for (const k of ['b', 'i', 'u', 's', 'href']) if (el.f[k] !== undefined) f[k] = el.f[k];
    }
    return f;
  };
  const flush = (force) => {
    const text = notePasteRunsToLine(runs);
    runs = [];
    if (text) {
      lines.push(prefix + text);
      prefix = '';
    } else if (force) {
      lines.push('');
    }
  };
  const inPre = () => stack.some((el) => el.tag === 'pre');
  const addText = (text) => {
    if (!text) return;
    const f = current();
    runs.push({ text: text.replace(/\[\[|\]\]/g, ''), b: f.b, i: f.i, u: f.u, s: f.s, href: f.href });
  };

  const tokenRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)/g;
  let t;
  while ((t = tokenRe.exec(cleaned)) !== null) {
    if (t[4] !== undefined) {
      const text = notePasteDecode(t[4]);
      if (inPre()) {
        const parts = text.split(/\r?\n/);
        parts.forEach((p, n) => { if (n > 0) flush(true); addText(p); });
      } else {
        addText(text.replace(/\s+/g, ' '));
      }
      continue;
    }
    const closing = t[1] === '/';
    const tag = t[2].toLowerCase();
    const attrs = t[3];
    if (tag === 'br') { flush(true); continue; }
    if (tag === 'td' || tag === 'th') { if (!closing && runs.length) addText(' '); continue; }
    const isBlock = NOTE_PASTE_BLOCK_TAGS.has(tag);
    if (closing) {
      if (isBlock) flush(false);
      for (let n = stack.length - 1; n >= 0; n--) {
        if (stack[n].tag === tag) { stack.length = n; break; }
      }
      if ((tag === 'ul' || tag === 'ol') && lists.length) lists.pop();
      continue;
    }
    if (isBlock) flush(false);
    if (tag === 'ul' || tag === 'ol') lists.push({ ordered: tag === 'ol', n: 0 });
    if (tag === 'li') {
      const checked = notePasteAttr(attrs, 'aria-checked');
      const list = lists[lists.length - 1];
      if (checked === 'true' || checked === 'mixed') prefix = '☒ ';
      else if (checked === 'false') prefix = '☐ ';
      else if (list && list.ordered) { list.n += 1; prefix = list.n + '. '; }
      else prefix = '- ';
    }
    if (NOTE_PASTE_VOID_TAGS.has(tag) || /\/\s*$/.test(attrs)) continue;
    stack.push({ tag, f: notePasteElementFormat(tag, attrs) });
  }
  flush(false);
  return notePasteTidy(lines);
}

function notePastePlainToLines(text) {
  return notePasteTidy(text.replace(/\r\n?/g, '\n').split('\n').map((line) => {
    const bullet = /^\s*[*+\u2022\u25cf-]\s+(.*)$/.exec(line);
    if (bullet && !/^\s*\*\*/.test(line)) return '- ' + bullet[1];
    return line.replace(/^\s+(?=\d+\.\s)/, '');
  }));
}

/**
 * @param {{html?: string, text?: string}} clip clipboard text/html and text/plain payloads
 * @returns {string[]|null} note lines to insert, or null when the paste is a single plain line
 *   the browser should handle natively (keeps its own undo history).
 */
export function clipboardToNoteLines({ html = '', text = '' } = {}) {
  const fromHtml = html && /<[a-z][\s\S]*>/i.test(html) ? notePasteHtmlToLines(html) : [];
  const lines = fromHtml.length ? fromHtml : notePastePlainToLines(text || '');
  if (lines.length === 0) return null;
  if (lines.length === 1 && lines[0] === (text || '').trim()) return null;
  return lines;
}

export function isNoteListLine(line) {
  return NOTE_PASTE_LIST_LINE.test(line || '');
}
