/**
 * @file dayDocView.test.js
 * @description Notes panel "Google Doc view": a read-only render of one day of the monthly notes Doc, plus a link that
 * opens the real editor. The server returns a structured model (blocks of runs), never HTML, so the client renders it
 * with x-text and nothing needs a sanitizer. Covers the pure formatter, the getDayDocView RPC against the real Code.gs,
 * both client copies, and the markup and styles of both copies.
 */
import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeGasContext, loadGasFile, toHost } from './helpers/gasRuntimeStubs.js';
import { bothClients, makeVm, settle } from './helpers/plannerHarness.js';
import { dayDocBlocks, dayDocHeadingLink } from '../src/integration/dayDocView.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const run = (text, style = {}) => ({ textRun: { content: text, textStyle: style } });
const para = (named, runs, extra = {}) => ({ paragraph: { paragraphStyle: { namedStyleType: named }, elements: runs, ...extra } });

describe('dayDocBlocks', () => {
  it('maps headings, bullets and plain paragraphs, dropping blank lines and page breaks', () => {
    const blocks = dayDocBlocks([
      para('HEADING_3', [run('#index [Work] Plan\n')]),
      para('NORMAL_TEXT', [run('first\n')], { bullet: { listId: 'l1' } }),
      para('NORMAL_TEXT', [run('\n')]),
      { paragraph: { elements: [{ pageBreak: {} }] } },
      para('NORMAL_TEXT', [run('plain\n')])
    ]);
    assert.deepEqual(blocks.map((b) => b.style), ['h3', 'li', 'p']);
    assert.deepEqual(blocks.map((b) => b.runs.map((r) => r.text).join('')), ['#index [Work] Plan', 'first', 'plain']);
  });

  it('keeps bold, italic and https links on runs, and drops other link schemes', () => {
    const [b] = dayDocBlocks([para('NORMAL_TEXT', [
      run('a ', { bold: true }), run('b ', { italic: true }),
      run('c ', { link: { url: 'https://example.com/x?y=1' } }),
      run('d', { link: { url: 'javascript:alert(1)' } }),
      run('\n')
    ])]);
    assert.deepEqual(b.runs, [
      { text: 'a ', bold: true },
      { text: 'b ', italic: true },
      { text: 'c ', href: 'https://example.com/x?y=1' },
      { text: 'd' }
    ]);
  });

  it('returns an empty list for no elements', () => {
    assert.deepEqual(dayDocBlocks([]), []);
    assert.deepEqual(dayDocBlocks(undefined), []);
  });
});

describe('dayDocHeadingLink', () => {
  const url = 'https://docs.google.com/document/d/D1/edit';
  it('appends the heading id from a fresh read', () => {
    assert.equal(dayDocHeadingLink(url, para('HEADING_2', [run('x')], { paragraphStyle: { headingId: 'h.abc' } })), `${url}#heading=h.abc`);
  });
  it('falls back to the plain Doc link when there is no heading id', () => {
    assert.equal(dayDocHeadingLink(url, para('HEADING_2', [run('x')])), url);
    assert.equal(dayDocHeadingLink(url, null), url);
  });
});

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DAY = '2026-10-29';
const emptyIter = () => ({ hasNext: () => false, next: () => { throw new Error('empty'); } });

function codeCtx() {
  const ctx = makeGasContext();
  ctx.__fakes.driveFiles.push({ id: 'ROOT', title: 'Day Planner', mimeType: FOLDER_MIME, parents: [] });
  const root = {
    getId: () => 'ROOT',
    getName: () => 'Day Planner',
    getFoldersByName: emptyIter,
    getFilesByName: (name) => {
      const hits = ctx.__fakes.driveFiles.filter((x) => x.title === name && x.parents.some((p) => p.id === 'ROOT'));
      let i = 0;
      return { hasNext: () => i < hits.length, next: () => ({ getId: () => hits[i++].id }) };
    }
  };
  ctx.DriveApp = {
    getFoldersByName: emptyIter,
    getFolderById: (id) => { if (id !== 'ROOT') throw new Error('No item with the given ID'); return root; }
  };
  ctx.Utilities.formatDate = () => '2026-10-29 12:00:00';
  ctx.PropertiesService.getUserProperties().setProperty('DAY_PLANNER_ROOT_FOLDER_ID', 'ROOT');
  loadGasFile(ctx, 'Code.gs');
  return ctx;
}

describe('getDayDocView (Code.gs)', () => {
  it('renders the day as blocks with the Doc link, read-only', () => {
    const ctx = codeCtx();
    ctx.saveDailyDocCards(DAY, '### #index [Work] Plan\n- first bullet\n- see [[link:https://example.com/a]]a link[[/link]] after\nplain line');
    const before = ctx.__fakes.driveFiles.length;
    const r = toHost(ctx.getDayDocView(DAY));
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.blocks.map((b) => b.style), ['h3', 'li', 'li', 'p']);
    assert.match(r.blocks[2].runs.map((x) => x.text).join(''), /^see .*a link.* after$/, 'the Doc text as stored, markup included');
    assert.match(r.docUrl, /^https:\/\/docs\.google\.com\/document\/d\/.+\/edit$/);
    assert.equal(r.headingLink.startsWith(r.docUrl), true);
    assert.equal(ctx.__fakes.driveFiles.length, before, 'a read must not create files');
  });

  it('a day with no section is ok with no blocks', () => {
    const ctx = codeCtx();
    ctx.saveDailyDocCards(DAY, 'only today');
    const r = toHost(ctx.getDayDocView('2026-10-30'));
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.blocks, []);
  });

  it('a month Doc with a second tab comes back as an error naming the tabs', () => {
    const ctx = codeCtx();
    ctx.saveDailyDocCards(DAY, 'hello');
    ctx.__fakes.docs[ctx.__fakes.driveFiles.find((f) => f.mimeType.endsWith('document')).id].extraTabs = 1;
    const r = toHost(ctx.getDayDocView(DAY));
    assert.equal(r.ok, false);
    assert.match(r.error, /2 tabs/);
  });

  it('rejects a malformed date', () => {
    const ctx = codeCtx();
    assert.throws(() => ctx.getDayDocView('tomorrow'));
  });
});

for (const c of await bothClients()) {
  describe(`Google Doc view [${c.label}]`, () => {
    const view = { ok: true, blocks: [{ style: 'p', runs: [{ text: 'hi' }] }], docUrl: 'https://d/edit', headingLink: 'https://d/edit#heading=h.1' };
    const vm = (over = {}) => makeVm(c.factory, { selectedDate: '2031-03-12', ...over });

    it('opening the view loads the selected day through the bridge', async () => {
      const seen = [];
      const v = vm({ bridge: { getDayDocView: async (d) => { seen.push(d); return view; } } });
      await v.toggleDocView();
      assert.equal(v.docViewOpen, true);
      assert.deepEqual(seen, ['2031-03-12']);
      assert.deepEqual(v.docView.blocks, view.blocks);
      assert.equal(v.docView.headingLink, view.headingLink);
      assert.equal(v.docView.loading, false);
    });

    it('docBlockMarkup renders stored markup and Doc links as rich text, escaping the rest', () => {
      const v = vm();
      const html = v.renderCardLine(v.docBlockMarkup({ style: 'p', runs: [{ text: 'a **bold** <i>x</i> ' }, { text: 'go', href: 'https://x.com/d' }] }), false);
      assert.match(html, /<span class="note-render-bold">bold<\/span>/);
      assert.match(html, /&lt;i&gt;x&lt;\/i&gt;/);
      assert.match(html, /<a [^>]*href="https:\/\/x\.com\/d"[^>]*>go<\/a>/);
      assert.doesNotMatch(html, /\*\*/);
    });

    it('closing the view makes no call', async () => {
      let calls = 0;
      const v = vm({ docViewOpen: true, bridge: { getDayDocView: async () => { calls += 1; return view; } } });
      await v.toggleDocView();
      assert.equal(v.docViewOpen, false);
      assert.equal(calls, 0);
    });

    it('a failed load shows the message in the panel and logs the stack', async () => {
      const v = vm({ bridge: { getDayDocView: async () => ({ ok: false, error: 'Notes Doc D1 has 2 tabs' }) } });
      const errors = [];
      const real = console.error;
      console.error = (...a) => errors.push(a.join(' '));
      try { await v.toggleDocView(); } finally { console.error = real; }
      assert.equal(v.docView.error, 'Notes Doc D1 has 2 tabs');
      assert.deepEqual(v.docView.blocks, []);
      assert.equal(errors.length, 1);
    });

    it('an answer for a day the user already left is dropped', async () => {
      let release;
      const slow = new Promise((r) => { release = r; });
      const v = vm({ bridge: { getDayDocView: () => slow } });
      const p = v.toggleDocView();
      v.selectedDate = '2031-03-13';
      release(view);
      await p;
      assert.deepEqual(v.docView.blocks, []);
    });

    it('moving to another day while the view is open reloads it', async () => {
      const seen = [];
      const v = vm({
        docViewOpen: true,
        bridge: {
          getDayDocView: async (d) => { seen.push(d); return view; },
          getDailyData: async (d) => ({ date: d, tasks: [], calendarEvents: [], noteContent: '' })
        }
      });
      v.selectedDate = '2031-03-13';
      await v.loadDayData().catch(() => {});
      await settle();
      assert.deepEqual(seen, ['2031-03-13']);
    });
  });
}

test('both Index copies bind the Doc view toggle, the link and the blocks', () => {
  for (const p of ['gas-app/Index.html', 'index.html']) {
    const src = read(p);
    assert.match(src, /@click="toggleDocView\(\)"/, p);
    assert.match(src, /class="note-gdoc-container" x-show="docViewOpen"/, p);
    assert.match(src, /:href="docView\.headingLink"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/, p);
    assert.match(src, /x-for="\(block, bi\) in docView\.blocks"/, p);
    assert.match(src, /x-show="noteViewMode === 'cards' &amp;&amp; !docViewOpen"|x-show="noteViewMode === 'cards' && !docViewOpen"/, p);
  }
});

test('both style copies define the Doc view container', () => {
  for (const p of ['src/styles.css', 'gas-app/Styles.html']) {
    assert.match(read(p), /\.note-gdoc-container\s*\{/, p);
  }
});
