/**
 * @file lineEditor.test.js
 * @description Notes WYSIWYG line editor core: a note line (markup text as stored in the Doc) renders to an
 * editable rich tree and serializes back to the identical markup. Runs src/lineEditor.js and its Script.html mirror.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import * as srcMod from '../src/lineEditor.js';
import { loadScriptHtml } from './helpers/plannerHarness.js';

const gasScope = loadScriptHtml({ exportNames: ['lineEditorSplitPrefix', 'lineEditorRender', 'lineEditorSerialize', 'lineEditorTextLength', 'lineEditorSlice'] }).scope;
const gasMod = {
  lineEditorSplitPrefix: gasScope.lineEditorSplitPrefix,
  lineEditorRender: gasScope.lineEditorRender,
  lineEditorSerialize: gasScope.lineEditorSerialize,
  lineEditorTextLength: gasScope.lineEditorTextLength,
  lineEditorSlice: gasScope.lineEditorSlice
};

const REAL_LINES = [
  '- **bold** and *it* [[link:https://x.com]]a link[[/link]] #decision [Budget]',
  '☐ [[color:red]]x[[/color]]',
  '1. ~~s~~ __u__',
  '**bold *nested italic* tail**',
  '#index [Work] Plan',
  'unmatched ** star and ~~ tilde and [[link:oops',
  '',
  'plain text with 2 * 3 * 4'
];

for (const [label, m] of [['src/lineEditor.js', srcMod], ['gas-app/Script.html', gasMod]]) {
  describe(`lineEditor [${label}]`, () => {
    it('splits the list prefix from the body', () => {
      assert.deepEqual(m.lineEditorSplitPrefix('- item'), { prefix: '- ', body: 'item' });
      assert.deepEqual(m.lineEditorSplitPrefix('12. item'), { prefix: '12. ', body: 'item' });
      assert.deepEqual(m.lineEditorSplitPrefix('☒ done'), { prefix: '☒ ', body: 'done' });
      assert.deepEqual(m.lineEditorSplitPrefix('plain'), { prefix: '', body: 'plain' });
    });

    it('renders bold, italic, underline, strike, color and link as elements', () => {
      const nodes = m.lineEditorRender('**b** *i* __u__ ~~s~~ [[color:red]]c[[/color]] [[link:https://x.com]]l[[/link]]');
      const tags = nodes.filter((n) => typeof n !== 'string').map((n) => n.tag);
      assert.deepEqual(tags, ['b', 'i', 'u', 's', 'span', 'a']);
      const color = nodes.find((n) => n.tag === 'span');
      assert.equal(color.attrs['data-color'], 'red');
      assert.equal(nodes.find((n) => n.tag === 'a').attrs['data-href'], 'https://x.com');
    });

    it('round-trips real lines exactly', () => {
      for (const line of REAL_LINES) assert.equal(m.lineEditorSerialize(m.lineEditorRender(line)), line, line);
    });

    it('round-trips any string exactly (property)', () => {
      const alphabet = fc.constantFrom('a', 'b', ' ', '*', '**', '~~', '__', '[[color:red]]', '[[/color]]', '[[link:https://x.com]]', '[[/link]]', '#decision', '[', ']', '_', '~');
      fc.assert(fc.property(fc.array(alphabet, { maxLength: 24 }).map((a) => a.join('')), (s) => m.lineEditorSerialize(m.lineEditorRender(s)) === s));
      fc.assert(fc.property(fc.string({ maxLength: 40 }), (s) => m.lineEditorSerialize(m.lineEditorRender(s)) === s));
    });

    it('counts the visible text length, ignoring markers', () => {
      assert.equal(m.lineEditorTextLength(m.lineEditorRender('**ab** c [[link:https://x.com]]de[[/link]]')), 7);
      assert.equal(m.lineEditorTextLength(m.lineEditorRender('')), 0);
      assert.equal(m.lineEditorTextLength(m.lineEditorRender('stray ** star')), 13);
    });

    it('splits markup around visible-text offsets, keeping wrappers on both sides', () => {
      const split = (body, a, b) => {
        const nodes = m.lineEditorRender(body);
        return { before: m.lineEditorSerialize(m.lineEditorSlice(nodes, 0, a)), after: m.lineEditorSerialize(m.lineEditorSlice(nodes, b, Infinity)) };
      };
      assert.deepEqual(split('**bold text** tail', 4, 4), { before: '**bold**', after: '** text** tail' });
      assert.deepEqual(split('a [[link:https://x.com]]link[[/link]] b', 4, 5), { before: 'a [[link:https://x.com]]li[[/link]]', after: '[[link:https://x.com]]k[[/link]] b' });
      assert.deepEqual(split('plain', 0, 5), { before: '', after: '' });
      assert.deepEqual(split('', 0, 0), { before: '', after: '' });
    });

    it('serializes browser tag variants, nbsp and ignores br', () => {
      const t = (tag, ...children) => ({ tag, attrs: {}, children });
      assert.equal(m.lineEditorSerialize([t('strong', 'a'), ' ', t('em', 'b'), t('strike', 'c'), t('del', 'd'), t('br')]), '**a** *b*~~c~~~~d~~');
      assert.equal(m.lineEditorSerialize([{ tag: 'a', attrs: { href: 'https://y.com' }, children: ['go'] }]), '[[link:https://y.com]]go[[/link]]');
      assert.equal(m.lineEditorSerialize([{ tag: 'a', attrs: { href: 'javascript:alert(1)' }, children: ['go'] }]), 'go');
      assert.equal(m.lineEditorSerialize([t('b')]), '');
      assert.equal(m.lineEditorSerialize([{ tag: 'font', attrs: {}, children: ['x'] }]), 'x');
    });
  });
}

/* Minimal DOM stand-ins: the adapter only touches nodeType, nodeName, nodeValue, childNodes and getAttribute (read)
   and createTextNode, createElement, createDocumentFragment, appendChild, setAttribute (write). */
function fakeDoc() {
  const mk = (extra) => ({ childNodes: [], attrs: {}, appendChild(c) { if (c.nodeType === 11) this.childNodes.push(...c.childNodes); else this.childNodes.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, ...extra });
  return {
    createTextNode: (t) => mk({ nodeType: 3, nodeName: '#text', nodeValue: t }),
    createElement: (n) => mk({ nodeType: 1, nodeName: n.toUpperCase() }),
    createDocumentFragment: () => mk({ nodeType: 11, nodeName: '#document-fragment' })
  };
}

const DOM_NAMES = ['lineEditorRender', 'lineEditorSerialize', 'lineEditorToDom', 'lineEditorFromDom'];
const gasDomScope = loadScriptHtml({ exportNames: DOM_NAMES }).scope;
const gasDomMod = Object.fromEntries(DOM_NAMES.map((n) => [n, gasDomScope[n]]));

for (const [label, mod] of [['src/lineEditor.js', srcMod], ['gas-app/Script.html', gasDomMod]]) {
  describe(`lineEditor DOM adapter [${label}]`, () => {
    it('round-trips markup through a DOM fragment', () => {
      for (const line of REAL_LINES) {
        const frag = mod.lineEditorToDom(mod.lineEditorRender(line), fakeDoc());
        assert.equal(mod.lineEditorSerialize(mod.lineEditorFromDom(frag)), line, line);
      }
    });

    it('builds b, span data-color and a data-href elements', () => {
      const frag = mod.lineEditorToDom(mod.lineEditorRender('**x** [[color:red]]y[[/color]] [[link:https://x.com]]z[[/link]]'), fakeDoc());
      const els = frag.childNodes.filter((n) => n.nodeType === 1);
      assert.deepEqual(els.map((n) => n.nodeName), ['B', 'SPAN', 'A']);
      assert.equal(els[1].attrs['data-color'], 'red');
      assert.equal(els[2].attrs['data-href'], 'https://x.com');
    });

    it('reads browser-made tags (strong, comments) from a DOM', () => {
      const d = fakeDoc();
      const root = d.createDocumentFragment();
      const strong = d.createElement('strong');
      strong.appendChild(d.createTextNode('a'));
      root.appendChild(strong);
      root.appendChild({ nodeType: 8, nodeName: '#comment', nodeValue: 'x', childNodes: [] });
      root.appendChild(d.createTextNode('b'));
      assert.equal(mod.lineEditorSerialize(mod.lineEditorFromDom(root)), '**a**b');
    });
  });
}
