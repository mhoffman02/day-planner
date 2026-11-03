/**
 * @file lineEditor.js
 * @description Core of the Notes WYSIWYG line editor. A note line is stored as markup text
 * (**bold**, *italic*, __underline__, ~~strike~~, color and link wrappers). The editor shows it as
 * rich text: lineEditorRender turns the markup into a small element tree, and lineEditorSerialize
 * turns the tree (or a tree read back from the browser DOM) into the identical markup. The parse is
 * lossless: any marker without a closer stays literal text, so serialize(render(m)) equals m for
 * every string. Pure data, no DOM, so it runs in node tests.
 * Mirrored verbatim into gas-app/Script.html (tests/lineEditor.test.js runs both copies).
 * Comment prose here avoids apostrophes, backticks and double slashes (GAS HtmlService
 * truncation, see gas-html-safe-chars).
 */

const LINE_EDITOR_PREFIX = /^(?:- |\d+\. |[☐☒☑] )/;
const LINE_EDITOR_COLORS = ['teal', 'red', 'green', 'blue'];
const LINE_EDITOR_SAFE_HREF = /^(?:https?|mailto):[^\s\]]+$/i;
const LINE_EDITOR_COLOR_OPEN = /^\[\[color:(teal|red|green|blue)\]\]/;
const LINE_EDITOR_LINK_OPEN = /^\[\[link:((?:https?|mailto):[^\]\s]+)\]\]/;
const LINE_EDITOR_PAIRS = [['**', 'b'], ['~~', 's'], ['__', 'u']];

/**
 * @param {string} line One stored note line.
 * @returns {{prefix: string, body: string}} The list marker (bullet, number or checkbox glyph) and the rest.
 */
function lineEditorSplitPrefix(line) {
  const m = LINE_EDITOR_PREFIX.exec(line);
  return m ? { prefix: m[0], body: line.slice(m[0].length) } : { prefix: '', body: line };
}

// A lone star that is not part of a double star, found at or after from.
function lineEditorFindSingleStar(s, from) {
  for (let j = from; j < s.length; j += 1) {
    if (s[j] === '*' && s[j - 1] !== '*' && s[j + 1] !== '*') return j;
  }
  return -1;
}

function lineEditorEl(tag, attrs, children) {
  return { tag, attrs, children };
}

// Tries to open a wrapper at position i. Returns {node, next} or null when nothing opens there.
function lineEditorOpenAt(s, i) {
  const rest = s.slice(i);
  const color = LINE_EDITOR_COLOR_OPEN.exec(rest);
  if (color) {
    const from = i + color[0].length;
    const end = s.indexOf('[[/color]]', from);
    if (end > from) {
      return { node: lineEditorEl('span', { 'data-color': color[1] }, lineEditorParse(s.slice(from, end))), next: end + '[[/color]]'.length };
    }
    return null;
  }
  const link = LINE_EDITOR_LINK_OPEN.exec(rest);
  if (link) {
    const from = i + link[0].length;
    const end = s.indexOf('[[/link]]', from);
    if (end > from) {
      return { node: lineEditorEl('a', { 'data-href': link[1] }, lineEditorParse(s.slice(from, end))), next: end + '[[/link]]'.length };
    }
    return null;
  }
  for (const [mark, tag] of LINE_EDITOR_PAIRS) {
    if (rest.startsWith(mark)) {
      const from = i + mark.length;
      const end = s.indexOf(mark, from);
      if (end > from) return { node: lineEditorEl(tag, {}, lineEditorParse(s.slice(from, end))), next: end + mark.length };
      return null;
    }
  }
  if (s[i] === '*' && s[i + 1] !== '*') {
    const end = lineEditorFindSingleStar(s, i + 1);
    if (end > i + 1) return { node: lineEditorEl('i', {}, lineEditorParse(s.slice(i + 1, end))), next: end + 1 };
  }
  return null;
}

function lineEditorParse(s) {
  const out = [];
  let text = '';
  let i = 0;
  while (i < s.length) {
    const opened = lineEditorOpenAt(s, i);
    if (opened) {
      if (text) out.push(text);
      text = '';
      out.push(opened.node);
      i = opened.next;
    } else {
      text += s[i];
      i += 1;
    }
  }
  if (text) out.push(text);
  return out;
}

/**
 * @param {string} body Line text without its list prefix.
 * @returns {Array<string|{tag: string, attrs: object, children: Array}>} Editable tree: text strings and b, i, u, s, span (data-color), a (data-href) elements.
 */
function lineEditorRender(body) {
  return lineEditorParse(String(body));
}

function lineEditorWrap(mark, kids) {
  return kids === '' ? '' : mark + kids + mark;
}

function lineEditorSerializeNode(node) {
  if (typeof node === 'string') return node.replace(/\u00a0/g, ' ');
  const attrs = node.attrs || {};
  const kids = lineEditorSerialize(node.children || []);
  switch (node.tag) {
    case 'b': case 'strong': return lineEditorWrap('**', kids);
    case 'i': case 'em': return lineEditorWrap('*', kids);
    case 'u': return lineEditorWrap('__', kids);
    case 's': case 'strike': case 'del': return lineEditorWrap('~~', kids);
    case 'br': return '';
    case 'span':
      return kids !== '' && LINE_EDITOR_COLORS.includes(attrs['data-color'])
        ? '[[color:' + attrs['data-color'] + ']]' + kids + '[[/color]]'
        : kids;
    case 'a': {
      const href = String(attrs['data-href'] || attrs.href || '').trim();
      return kids !== '' && LINE_EDITOR_SAFE_HREF.test(href) ? '[[link:' + href + ']]' + kids + '[[/link]]' : kids;
    }
    default: return kids;
  }
}

/**
 * @param {Array} nodes Tree from lineEditorRender or read back from the browser DOM.
 * @returns {string} The stored markup text.
 */
function lineEditorSerialize(nodes) {
  return nodes.map(lineEditorSerializeNode).join('');
}

/**
 * @param {Array} nodes Tree from lineEditorRender.
 * @returns {number} Visible text length, markers excluded. This is the caret offset unit the editor uses.
 */
function lineEditorTextLength(nodes) {
  let n = 0;
  for (const node of nodes) n += typeof node === 'string' ? node.length : lineEditorTextLength(node.children || []);
  return n;
}

/**
 * @param {Array} nodes Tree from lineEditorRender.
 * @param {number} from Visible-text offset where the slice starts.
 * @param {number} to Visible-text offset where the slice ends (Infinity for the rest).
 * @returns {Array} The part of the tree inside [from, to), wrappers kept on every piece they cover.
 */
function lineEditorSlice(nodes, from, to) {
  const out = [];
  let pos = 0;
  for (const node of nodes) {
    const len = typeof node === 'string' ? node.length : lineEditorTextLength([node]);
    const a = Math.max(from - pos, 0);
    const b = Math.min(to - pos, len);
    if (b > a) {
      out.push(typeof node === 'string' ? node.slice(a, b) : { tag: node.tag, attrs: node.attrs, children: lineEditorSlice(node.children || [], a, b) });
    }
    pos += len;
  }
  return out;
}

function lineEditorUncolor(nodes) {
  const out = [];
  for (const node of nodes) {
    if (typeof node === 'string') out.push(node);
    else if (node.tag === 'span' && (node.attrs || {})['data-color']) out.push(...lineEditorUncolor(node.children || []));
    else out.push({ tag: node.tag, attrs: node.attrs, children: lineEditorUncolor(node.children || []) });
  }
  return out;
}

/**
 * @param {string} body Line markup without its list prefix.
 * @param {number} start Visible-text offset where the selection starts.
 * @param {number} end Visible-text offset where the selection ends.
 * @param {string} color teal, red, green, blue, or default to clear color.
 * @returns {string} The markup with only [start, end) recolored; other formatting is kept.
 */
function lineEditorColorRange(body, start, end, color) {
  const nodes = lineEditorRender(body);
  const mid = lineEditorUncolor(lineEditorSlice(nodes, start, end));
  const wrapped = color === 'default' ? mid : [{ tag: 'span', attrs: { 'data-color': color }, children: mid }];
  return lineEditorSerialize(lineEditorSlice(nodes, 0, start)) + lineEditorSerialize(wrapped) + lineEditorSerialize(lineEditorSlice(nodes, end, Infinity));
}

const LINE_EDITOR_TAGS = { b: 'b', i: 'i', u: 'u', s: 's', span: 'span', a: 'a' };

/**
 * @param {Array} nodes Tree from lineEditorRender.
 * @param {{createTextNode: Function, createElement: Function, createDocumentFragment: Function}} doc A document.
 * @returns {object} A fragment holding the editable elements. Links carry data-href only, never a real href, so a click inside the editor cannot navigate.
 */
function lineEditorToDom(nodes, doc) {
  const frag = doc.createDocumentFragment();
  for (const node of nodes) {
    if (typeof node === 'string') {
      frag.appendChild(doc.createTextNode(node));
    } else {
      const el = doc.createElement(LINE_EDITOR_TAGS[node.tag]);
      for (const key of Object.keys(node.attrs || {})) el.setAttribute(key, node.attrs[key]);
      el.appendChild(lineEditorToDom(node.children || [], doc));
      frag.appendChild(el);
    }
  }
  return frag;
}

/**
 * @param {object} root A DOM node (element or fragment) whose children are the edited line.
 * @returns {Array} Tree for lineEditorSerialize: text strings and tag, attrs, children objects. Comments are dropped.
 */
function lineEditorFromDom(root) {
  const out = [];
  for (const n of Array.from(root.childNodes)) {
    if (n.nodeType === 3) {
      out.push(n.nodeValue);
    } else if (n.nodeType === 1) {
      const attrs = {};
      for (const key of ['data-color', 'data-href', 'href']) {
        const v = n.getAttribute(key);
        if (v !== null && v !== undefined) attrs[key] = v;
      }
      out.push({ tag: n.nodeName.toLowerCase(), attrs, children: lineEditorFromDom(n) });
    }
  }
  return out;
}

export { lineEditorSplitPrefix, lineEditorRender, lineEditorSerialize, lineEditorTextLength, lineEditorSlice, lineEditorColorRange, lineEditorToDom, lineEditorFromDom };
