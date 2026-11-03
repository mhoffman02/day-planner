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
  describe(`Open Notes in Docs link [${c.label}]`, () => {
    const view = { ok: true, blocks: [], docUrl: 'https://d/edit', headingLink: 'https://d/edit#heading=h.1' };
    const vm = (over = {}) => makeVm(c.factory, { selectedDate: '2031-03-12', ...over });

    it('the toggle and inline view are gone', () => {
      const v = vm();
      assert.equal(v.toggleDocView, undefined);
      assert.equal(v.docViewOpen, undefined);
      assert.equal(v.docBlockMarkup, undefined);
    });

    it('loadDocLink keeps the day heading link for the selected day', async () => {
      const seen = [];
      const v = vm({ bridge: { getDayDocView: async (d) => { seen.push(d); return view; } } });
      await v.loadDocLink();
      assert.deepEqual(seen, ['2031-03-12']);
      assert.equal(v.docLink.url, view.headingLink);
    });

    it('a failed load leaves the link empty and logs the stack', async () => {
      const v = vm({ bridge: { getDayDocView: async () => ({ ok: false, error: 'Notes Doc D1 has 2 tabs' }) } });
      const errors = [];
      const real = console.error;
      console.error = (...a) => errors.push(a.join(' '));
      try { await v.loadDocLink(); } finally { console.error = real; }
      assert.equal(v.docLink.url, '');
      assert.equal(errors.length, 1);
    });

    it('an answer for a day the user already left is dropped', async () => {
      let release;
      const slow = new Promise((r) => { release = r; });
      const v = vm({ bridge: { getDayDocView: () => slow } });
      const p = v.loadDocLink();
      v.selectedDate = '2031-03-13';
      release(view);
      await p;
      assert.equal(v.docLink.url, '');
    });

    it('moving to another day refreshes the link', async () => {
      const seen = [];
      const v = vm({
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

test('both Index copies carry a real Open Notes in Docs anchor and no inline Doc view', () => {
  for (const p of ['gas-app/Index.html', 'index.html']) {
    const src = read(p);
    assert.match(src, /<a [^>]*:href="docLink\.url \|\| false"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/, p);
    assert.match(src, /aria-label="Open Notes in Docs"/, p);
    assert.doesNotMatch(src, /toggleDocView|docViewOpen|note-gdoc-container|Google Doc view/, p);
  }
});

test('both style copies drop the inline Doc view styles', () => {
  for (const p of ['src/styles.css', 'gas-app/Styles.html']) {
    assert.doesNotMatch(read(p), /\.note-gdoc-container\s*\{/, p);
  }
});
