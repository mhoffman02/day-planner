/**
 * @file cardLineLinks.test.js
 * @description renderCardLine (x-html sink for every Notes card line) linkified in four passes; the
 * raw-URL pass re-scanned the anchors the markdown/bracket passes had generated, so a URL nested in a
 * link target broke out of href and injected attributes (onanimationstart). Links are now matched in
 * ONE pass over the escaped text and never re-scanned (formatting passes run around placeholders).
 * Both client copies run (src/app.js and gas-app/Script.html).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bothClients, makeVm } from './helpers/plannerHarness.js';

/** First index at or after from whose char matches re, else html.length. */
function scan(html, from, re) {
  let k = from;
  while (k < html.length && !re.test(html[k])) k++;
  return k;
}

/** Reads one attribute value starting at k (just after '='); returns [value, nextIndex]. */
function readValue(html, from) {
  const k = scan(html, from, /[^\t\n\f\r ]/);
  const q = html[k];
  if (q === '"' || q === "'") {
    const e = html.indexOf(q, k + 1);
    return e === -1 ? [html.slice(k + 1), html.length] : [html.slice(k + 1, e), e + 1];
  }
  const e = scan(html, k, /[\t\n\f\r >]/);
  return [html.slice(k, e), e];
}

/** Reads the attributes of a tag from j to its closing '>'; returns [attrs, indexOfGt]. */
function readAttrs(html, from) {
  const attrs = [];
  let j = from;
  while (j < html.length && html[j] !== '>') {
    if (/[\t\n\f\r /]/.test(html[j])) { j++; continue; }
    const nameEnd = scan(html, j + 1, /[\t\n\f\r />=]/);
    const name = html.slice(j, nameEnd).toLowerCase();
    let k = scan(html, nameEnd, /[^\t\n\f\r ]/);
    let value = '';
    if (html[k] === '=') [value, k] = readValue(html, k + 1);
    attrs.push([name, value]);
    j = k;
  }
  return [attrs, j];
}

/** Independent HTML-tokenizer view of the tags in out: name plus attributes as a browser reads them. */
function tagsOf(html) {
  const tags = [];
  let i = html.indexOf('<');
  while (i !== -1) {
    const m = /^<\/?([a-zA-Z][^\t\n\f\r />]*)/.exec(html.slice(i));
    if (!m) { i = html.indexOf('<', i + 1); continue; }
    const [attrs, j] = readAttrs(html, i + m[0].length);
    tags.push({ name: m[1].toLowerCase(), attrs, raw: html.slice(i, j + 1) });
    i = html.indexOf('<', j + 1);
  }
  return tags;
}

const ALLOWED_ATTRS = new Set(['class', 'href', 'target', 'rel', 'value']);

function assertNoBreakout(out, label) {
  assert.doesNotMatch(out, /<a href="[^"]*<a/, `${label}: anchor nested inside href: ${out}`);
  for (const t of tagsOf(out)) {
    for (const [name, value] of t.attrs) {
      assert.ok(!/^on/i.test(name), `${label}: event-handler attribute ${name} in ${t.raw}`);
      assert.ok(ALLOWED_ATTRS.has(name), `${label}: unexpected attribute ${name} in ${t.raw}\nfull: ${out}`);
      if (name === 'href') {
        assert.match(value, /^(?:https?|mailto):/i, `${label}: href scheme in ${t.raw}`);
        assert.ok(!/[<>"']/.test(value), `${label}: markup or quote inside href value: ${t.raw}`);
      }
    }
  }
}

const PAYLOADS = [
  ['markdown link with nested raw URL', "[x](https://a(https://b/style='animation-name:spin'onanimationstart=alert`1`//)"],
  ['bracket link with nested raw URL', "[[link:https://a(https://b/style='animation-name:spin'onanimationstart=alert`1`//]]x[[/link]]"],
  ['autolink with nested raw URL', "&lt;https://a(https://b/style='x'onanimationstart=alert`1`//&gt; <https://a(https://b/x'onfocus=alert`1`//>"],
  ['raw URL with quotes', "see (https://b/style='x'onmouseover=alert`1`//) now"],
  ['double quote in markdown href', '[x](https://a/"onmouseover="alert(1))'],
  ['underline markers inside href', 'see https://x.test/a__b and __c__'],
  ['bold markers across two hrefs', '[a](https://x.test/**) b [c](https://y.test/**)'],
  ['italic markers across two hrefs', '[a](https://x.test/*) b [c](https://y.test/*)'],
  ['strike markers inside href', '[a](https://x.test/~~"onclick=alert(1)//~~)'],
  ['color markers inside href', '[a](https://x.test/[[color:red]]x[[/color]])'],
  ['javascript scheme in markdown link', '[x](javascript:alert(1))'],
  ['javascript scheme in bracket link', '[[link:javascript:alert(1)]]x[[/link]]'],
  ['bracket link label with markdown link', '[[link:https://a.test]][y](https://b.test/"onclick=alert(1))[[/link]]']
];

const ANCHOR = (href, label) => `<a href="${href}" target="_blank" rel="noopener noreferrer" class="note-render-link">${label}</a>`;
const LINE = (inner) => `<div class="note-render-line">${inner}</div>`;

const EXACT = [
  ['markdown link', 'Review [Architecture Doc](https://docs.google.com/doc1) before Friday.',
    LINE(`Review ${ANCHOR('https://docs.google.com/doc1', 'Architecture Doc')} before Friday.`)],
  ['markdown link whose label is the URL', 'Review [https://docs.google.com/doc1](https://docs.google.com/doc1) now.',
    LINE(`Review ${ANCHOR('https://docs.google.com/doc1', 'https://docs.google.com/doc1')} now.`)],
  ['bracket link', 'Open [[link:https://drive.google.com/file1]]Google Doc[[/link]] in browser.',
    LINE(`Open ${ANCHOR('https://drive.google.com/file1', 'Google Doc')} in browser.`)],
  ['bracket link, empty label falls back to URL', 'Open [[link:https://drive.google.com/file1]][[/link]] in browser.',
    LINE(`Open ${ANCHOR('https://drive.google.com/file1', 'https://drive.google.com/file1')} in browser.`)],
  ['autolink', 'Source: <https://github.com/project>',
    LINE(`Source: ${ANCHOR('https://github.com/project', 'https://github.com/project')}`)],
  ['raw URL in parentheses', 'see (https://x.test/a) ok',
    LINE(`see (${ANCHOR('https://x.test/a', 'https://x.test/a')}) ok`)],
  ['mailto markdown link', '[mail](mailto:a@b.test)',
    LINE(ANCHOR('mailto:a@b.test', 'mail'))],
  ['ampersand in URL escaped once', '[q](https://x.test/?a=1&b=2)',
    LINE(ANCHOR('https://x.test/?a=1&amp;b=2', 'q'))],
  ['quotes escaped in href and label', "[it's \"x\"](https://x.test/a'b)",
    LINE(ANCHOR('https://x.test/a&#39;b', 'it&#39;s &quot;x&quot;'))],
  ['label formatting still applies', '[**bold**](https://x.test)',
    LINE(ANCHOR('https://x.test', '<span class="note-render-bold">bold</span>'))],
  ['formatting still wraps a link', '**see [x](https://x.test) now**',
    LINE(`<span class="note-render-bold">see ${ANCHOR('https://x.test', 'x')} now</span>`)],
  ['underscores in a raw URL stay in the URL', 'see https://x.test/a__b and __c__',
    LINE(`see ${ANCHOR('https://x.test/a__b', 'https://x.test/a__b')} and <span class="note-render-underline">c</span>`)]
];

for (const c of await bothClients()) {
  describe(`renderCardLine links [${c.label}]`, () => {
    const vm = makeVm(c.factory, {});
    for (const [name, payload] of PAYLOADS) {
      it(`no attribute breakout: ${name}`, () => {
        assertNoBreakout(vm.renderCardLine(payload, false), name);
        assertNoBreakout(vm.renderCardLine(`- ${payload}`, false), `${name} (list)`);
      });
    }
    for (const [name, input, expected] of EXACT) {
      it(name, () => {
        assert.equal(vm.renderCardLine(input, false), expected);
      });
    }
  });
}
