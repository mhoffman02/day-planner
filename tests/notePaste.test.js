/**
 * @file notePaste.test.js
 * @description Smart paste into Notes card lines: clipboard HTML from Gmail, Google Docs and
 * Gemini (or multi-line plain text) becomes one note line per paragraph in the card line format
 * (- bullets, 1. numbers, ☐/☒ checkboxes, **bold**, *italic*, __underline__, ~~strike~~,
 * [[link:URL]]text[[/link]]). Runs the converter from src/notePaste.js and its Script.html mirror,
 * and handleLinePaste in both client copies.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clipboardToNoteLines as srcConvert } from '../src/notePaste.js';
import { bothClients, loadScriptHtml, makeVm } from './helpers/plannerHarness.js';

const gasConvert = loadScriptHtml({ exportNames: ['clipboardToNoteLines'] }).scope.clipboardToNoteLines;

const CASES = [
  {
    name: 'Gmail divs, blank line, bold and link',
    html: '<div dir="ltr">Hi team,<div><br></div><div>Please <b>review</b> the <a href="https://x.com/d">doc</a>.</div></div>',
    text: 'Hi team,\n\nPlease review the doc.',
    want: ['Hi team,', '', 'Please **review** the [[link:https://x.com/d]]doc[[/link]].']
  },
  {
    name: 'Google Docs: outer normal-weight <b> wrapper is not bold; span styles are',
    html: '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-abc"><p dir="ltr"><span style="font-weight:400">Plain </span><span style="font-weight:700">Bold</span></p><ul><li dir="ltr" aria-level="1"><p dir="ltr" role="presentation"><span style="font-style:italic">ital</span></p></li></ul></b>',
    text: 'Plain Bold\nital',
    want: ['Plain **Bold**', '- *ital*']
  },
  {
    name: 'Gemini: heading, entity, ordered list',
    html: '<h2>Summary</h2><p>Text &amp; more</p><ol><li>First</li><li>Second</li></ol>',
    text: 'Summary\nText & more\nFirst\nSecond',
    want: ['**Summary**', 'Text & more', '1. First', '2. Second']
  },
  {
    name: 'unsafe link scheme keeps text, drops link',
    html: '<p><a href="javascript:alert(1)">x</a></p><p>y</p>',
    text: 'x\ny',
    want: ['x', 'y']
  },
  {
    name: 'script/style/comments stripped',
    html: '<style>p{color:red}</style><!--StartFragment--><p>a</p><script>bad()</script><p>b</p>',
    text: 'a\nb',
    want: ['a', 'b']
  },
  {
    name: 'Docs checklist',
    html: '<ul><li role="checkbox" aria-checked="false"><p>todo</p></li><li role="checkbox" aria-checked="true"><p>done</p></li></ul>',
    text: 'todo\ndone',
    want: ['☐ todo', '☒ done']
  },
  {
    name: 'a pasted ### line cannot split the card into a new topic',
    html: '<p>### not a card</p><p>z</p>',
    text: '### not a card\nz',
    want: ['**not a card**', 'z']
  },
  {
    name: 'underline and strike from style and tags',
    html: '<p><span style="text-decoration:underline">u</span> <s>s</s></p><p>x</p>',
    text: 'u s\nx',
    want: ['__u__ ~~s~~', 'x']
  },
  {
    name: 'plain-text markdown fallback (Gemini plain copy)',
    html: '',
    text: '## Plan\r\n* a\n  * b\n1. c\n\n\n**d**\n',
    want: ['**Plan**', '- a', '- b', '1. c', '', '**d**']
  },
  {
    name: 'single plain line is left to the browser',
    html: '',
    text: 'just a phrase',
    want: null
  },
  {
    name: 'single unformatted HTML span is left to the browser',
    html: '<span style="color:red">word</span>',
    text: 'word',
    want: null
  }
];

for (const [label, convert] of [['src/notePaste.js', srcConvert], ['gas-app/Script.html', gasConvert]]) {
  describe(`clipboardToNoteLines [${label}]`, () => {
    it('exists', () => assert.equal(typeof convert, 'function'));
    for (const c of CASES) {
      it(c.name, () => assert.deepEqual(convert({ html: c.html, text: c.text }), c.want));
    }
  });
}

function pasteEvent(data) {
  const ev = { prevented: false, clipboardData: { getData: (t) => data[t] || '' } };
  ev.preventDefault = () => { ev.prevented = true; };
  return ev;
}

for (const c of await bothClients()) {
  describe(`handleLinePaste multi-line [${c.label}]`, () => {
    function vmWith(content) {
      const vm = makeVm(c.factory, { bridge: {} });
      vm.syncCardsToDailyNote = () => { vm.synced = (vm.synced || 0) + 1; };
      return { vm, card: { id: 'c1', content } };
    }

    it('splits a pasted HTML list into new lines after a non-empty line', async () => {
      const { vm, card } = vmWith('alpha');
      const ev = pasteEvent({ 'text/html': '<ul><li>one</li><li><b>two</b></li></ul>', 'text/plain': 'one\ntwo' });
      await vm.handleLinePaste(ev, card, 0);
      assert.equal(ev.prevented, true);
      assert.equal(card.content, 'alpha\n- one\n- **two**');
      assert.equal(vm.synced, 1);
    });

    it('fills an empty line with the first pasted line', async () => {
      const { vm, card } = vmWith('\nlast');
      const ev = pasteEvent({ 'text/plain': 'p1\np2' });
      await vm.handleLinePaste(ev, card, 0);
      assert.equal(card.content, 'p1\np2\nlast');
    });

    it('inserts a single plain line as text, never as foreign HTML', async () => {
      const { vm, card } = vmWith('alpha');
      const ev = pasteEvent({ 'text/html': '<span style="color:red">word</span>', 'text/plain': 'word' });
      await vm.handleLinePaste(ev, card, 0);
      assert.equal(ev.prevented, true);
      assert.equal(card.content, 'alpha');
    });
  });
}
