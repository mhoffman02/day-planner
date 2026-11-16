/**
 * @file contractFixtures.test.js
 * @description A17.6 contract tests: Google API response fixtures (tests/fixtures/google/*.json, each marked
 * "shape from API reference, not captured" or "captured <date>, scrubbed", all values fake) run through the REAL
 * server mappers in gas-app/Code.gs and Engines.gs inside the vm GAS harness: mapCalendarApiEvent_ (via getDailyData),
 * the Tasks -> task mapping in getDailyData and getMasterTasks, and the Docs body readers (docBodyContent,
 * extractDaySectionText_, findDaySection_, buildDaySectionRequests_). A documented API field the mapper drops fails here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeGasContext, loadGasFile, toHost, stubPrimaryTimeZone } from './helpers/gasRuntimeStubs.js';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/google/', import.meta.url));
const PROVENANCE_RE = /^(shape from API reference, not captured|captured \d{4}-\d{2}-\d{2}, scrubbed)/;

function fixture(name) {
  const data = JSON.parse(fs.readFileSync(FIXTURE_DIR + name, 'utf8'));
  assert.match(data._provenance || '', PROVENANCE_RE, `${name} needs a _provenance header`);
  return data;
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }

function serverCtx() {
  const ctx = makeGasContext();
  stubPrimaryTimeZone(ctx, () => ({ timeZone: 'America/Chicago' }));
  loadGasFile(ctx, 'Code.gs');
  return ctx;
}

test('every fixture declares its provenance and carries no personal data', () => {
  const files = fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 4);
  for (const f of files) {
    const text = fs.readFileSync(FIXTURE_DIR + f, 'utf8');
    fixture(f);
    const emails = text.match(/[\w.+-]+@[\w.-]+/g) || [];
    for (const e of emails) assert.match(e, /@(resource\.)?example\.com$/, `${f}: non-example email ${e}`);
  }
});

// ---- Calendar: mapCalendarApiEvent_ through getDailyData ----

function dailyEvents() {
  const ctx = serverCtx();
  ctx.__fakes.events.push(...clone(fixture('calendar-events-list.json').items));
  const out = toHost(ctx.getDailyData('2026-11-09'));
  assert.deepEqual(out.warnings, []);
  return Object.fromEntries(out.calendarEvents.map((e) => [e.id, e]));
}

test('calendar contract: timed event with hangoutLink, attendees and gasTaskId in extendedProperties.shared', () => {
  const e = dailyEvents().evt_timed_meet_001;
  assert.deepEqual(e, {
    id: 'evt_timed_meet_001',
    title: 'Test Event Standup',
    startTime: '2026-11-09T09:00:00-06:00',
    endTime: '2026-11-09T09:30:00-06:00',
    location: 'Test Room 1',
    description: 'Test description line',
    meetLink: 'https://meet.google.com/aaa-bbbb-ccc',
    htmlLink: 'https://www.google.com/calendar/event?eid=FAKEEID001',
    syncTaskId: 'task_fake_001',
    myResponse: 'accepted',
    etag: '"3000000000000001"',
    recurringEventId: null,
    guestCount: 2, // people only: the room resource gets no "notify guests" prompt (user 2026-11-16)
    guests: [
      { name: 'Test Organizer', email: 'organizer@example.com', response: 'accepted', organizer: true, self: true },
      { name: 'Test Guest One', email: 'guest.one@example.com', response: 'tentative', organizer: false, self: false },
      { name: 'guest.two@example.com', email: 'guest.two@example.com', response: 'needsAction', organizer: false, self: false }
    ],
    canEdit: true,
    canDelete: true
  });
});

test('calendar contract: recurring instance picks the video entry point (trimmed), carries recurringEventId and my decline, is read-only', () => {
  const e = dailyEvents().evt_series_20261109T150000Z;
  assert.equal(e.meetLink, 'https://meet.google.com/ddd-eeee-fff');
  assert.equal(e.recurringEventId, 'evt_series');
  assert.equal(e.myResponse, 'declined');
  assert.equal(e.syncTaskId, null);
  assert.equal(e.guestCount, 1);
  assert.equal(e.guests[0].email, 'boss@example.com');
  assert.equal(e.canEdit, false);
  assert.equal(e.canDelete, false);
});

test('calendar contract: all-day event keeps the date-only start/end and is not editable', () => {
  const e = dailyEvents().evt_allday_001;
  assert.equal(e.startTime, '2026-11-09');
  assert.equal(e.endTime, '2026-11-10');
  assert.equal(e.title, 'Test Event All Day');
  assert.equal(e.canEdit, false);
  assert.equal(e.myResponse, null);
  assert.deepEqual(e.guests, []);
  assert.equal(e.meetLink, null);
});

test('calendar contract: untitled event gets a title, meet link from description text, guestsCanModify makes it editable', () => {
  const e = dailyEvents().evt_untitled_guests_modify;
  assert.equal(e.title, '(untitled)');
  assert.equal(e.meetLink, 'https://meet.google.com/ggg-hhhh-iii');
  assert.equal(e.canEdit, true);
  assert.equal(e.location, '');
});

test('calendar contract: special eventType (out of office) is read-only even when I organize it', () => {
  const e = dailyEvents().evt_ooo_001;
  assert.equal(e.title, 'Test Event Out of office');
  assert.equal(e.canEdit, false);
  assert.equal(e.canDelete, false);
});

// ---- Tasks: getDailyData and getMasterTasks ----

function tasksCtx() {
  const ctx = serverCtx();
  ctx.__fakes.tasks.push(...clone(fixture('tasks-list.json').items));
  return ctx;
}

test('tasks contract: getDailyData maps due (UTC midnight) to the local date key, tags to fields and completed to the check status', () => {
  const out = toHost(tasksCtx().getDailyData('2026-11-09'));
  assert.deepEqual(out.warnings, []);
  const byId = Object.fromEntries(out.tasks.map((t) => [t.id, t]));
  assert.deepEqual(Object.keys(byId).sort(), ['task_child_003', 'task_done_002', 'task_open_001']);
  assert.deepEqual(byId.task_open_001, {
    id: 'task_open_001',
    title: 'Test Task Open',
    status: '•',
    category: 'Work',
    dueDate: '2026-11-09',
    sourceMasterId: 'master_fake_9',
    goalRef: 'goal_fake_3',
    starred: true,
    notes: 'Plain note text'
  });
  assert.equal(byId.task_done_002.status, '✓');
  assert.equal(byId.task_done_002.category, 'General');
  assert.equal(byId.task_done_002.notes, '');
  assert.equal(byId.task_done_002.dueDate, '2026-11-09');
  assert.equal(byId.task_child_003.status, '○');
});

test('tasks contract: getMasterTasks maps undated, dated, completed and subtask resources', () => {
  const out = toHost(tasksCtx().getMasterTasks());
  const byId = Object.fromEntries(out.map((t) => [t.id, t]));
  assert.deepEqual(Object.keys(byId).sort(), ['task_child_003', 'task_open_001', 'task_other_day_004', 'task_undated_005']);
  assert.equal(byId.task_done_002, undefined, 'the master list drops completed tasks');
  assert.equal(byId.task_open_001.title, 'Test Task Open');
  assert.equal(byId.task_open_001.category, 'Work');
  assert.equal(byId.task_open_001.starred, true);
  assert.equal(byId.task_open_001.dueDate, '2026-11-09');
  assert.equal(byId.task_other_day_004.dueDate, '2026-11-12');
  assert.equal(byId.task_undated_005.category, 'Personal');
  assert.equal(byId.task_undated_005.dueDate, null);
});

// ---- Docs: docBodyContent, extractDaySectionText_, findDaySection_, buildDaySectionRequests_ ----

test('docs contract: docBodyContent returns the single tab body from a real-shaped response', () => {
  const ctx = serverCtx();
  const doc = clone(fixture('docs-document-tabs.json'));
  const content = toHost(ctx.DPEngines.docBodyContent(doc, 'fake_doc_id'));
  assert.equal(content.length, doc.tabs[0].documentTab.body.content.length);
  assert.ok(content[0].sectionBreak);
});

test('docs contract: a second tab fails loud with DOC_MULTI_TAB', () => {
  const ctx = serverCtx();
  assert.throws(() => ctx.DPEngines.docBodyContent(clone(fixture('docs-document-two-tabs.json')), 'fake_doc_id'), (e) => e.code === 'DOC_MULTI_TAB' && /2 tabs/.test(e.message));
});

const DOC_ID = 'fake_doc_id';
const emptyIter = () => ({ hasNext: () => false, next: () => { throw new Error('empty'); } });

// Month Doc served from the fixture; batchUpdate calls are captured instead of applied.
function docCtx() {
  const ctx = makeGasContext();
  const root = {
    getId: () => 'ROOT',
    getName: () => 'Day Planner',
    getFoldersByName: emptyIter,
    getFilesByName: (name) => (name === 'Day Planner Notes - November 2026'
      ? { hasNext: () => true, next: () => ({ getId: () => DOC_ID }) }
      : emptyIter())
  };
  ctx.DriveApp = { getFoldersByName: emptyIter, getFolderById: () => root };
  ctx.Utilities.formatDate = () => '2026-11-09 12:00:00';
  ctx.PropertiesService.getUserProperties().setProperty('DAY_PLANNER_ROOT_FOLDER_ID', 'ROOT');
  const batches = [];
  ctx.Docs.Documents.get = (id) => {
    assert.equal(id, DOC_ID);
    return clone(fixture('docs-document-tabs.json'));
  };
  ctx.Docs.Documents.batchUpdate = (body, id) => { batches.push({ body: toHost(body), id }); return { documentId: id }; };
  loadGasFile(ctx, 'Code.gs');
  return { ctx, batches };
}

test('docs contract: the day section is split at HEADING_2 and read as ### / - / plain lines, blank lines and page breaks dropped', () => {
  const { ctx } = docCtx();
  const read = (d) => ctx.getOrCreateDailyDocContent(d, DOC_ID);
  assert.equal(read('2026-11-09'), 'Test intro line\n### Test Topic\n- Test bullet one\n- Test bullet two\nPlain closing line');
  assert.equal(read('2026-11-08'), 'Other day note');
  assert.equal(read('2026-11-10'), 'Next day note');
  assert.match(read('2026-11-11'), /Initialized daily topic card/, 'a date with no section falls back to the placeholder card');
});

test('docs contract: the day heading link reads the Doc heading', () => {
  const { ctx } = docCtx();
  const out = toHost(ctx.getDayDocLink('2026-11-09'));
  assert.equal(out.ok, true);
  assert.equal(out.docUrl, `https://docs.google.com/document/d/${DOC_ID}/edit`);
});

test('docs contract: saving a day replaces exactly that section range (page break kept) with buildDaySectionRequests_ output', () => {
  const { ctx, batches } = docCtx();
  const doc = fixture('docs-document-tabs.json');
  const els = doc.tabs[0].documentTab.body.content.filter((e) => e.paragraph);
  const text = (e) => e.paragraph.elements.map((x) => (x.textRun ? x.textRun.content : '')).join('');
  const heading = els.find((e) => text(e).startsWith('Day Planner - Monday'));
  const last = els.find((e) => text(e) === 'Plain closing line\n');
  const res = toHost(ctx.saveDailyDocCards('2026-11-09', '### New Topic\n- new bullet\nnew plain', 'Test intro line\n### Test Topic\n- Test bullet one\n- Test bullet two\nPlain closing line'));
  assert.equal(res.success, true, JSON.stringify(res));
  assert.equal(batches.length, 1);
  const reqs = batches[0].body.requests;
  assert.deepEqual(reqs[0], { deleteContentRange: { range: { startIndex: heading.startIndex, endIndex: last.endIndex } } });
  const insert = reqs[1].insertText;
  assert.equal(insert.location.index, heading.startIndex);
  assert.equal(insert.text, 'Day Planner - Monday, November 9, 2026\nNew Topic\nnew bullet\nnew plain\n');
  const named = reqs.filter((r) => r.updateParagraphStyle).map((r) => r.updateParagraphStyle.paragraphStyle.namedStyleType);
  assert.deepEqual(named, ['NORMAL_TEXT', 'HEADING_2', 'HEADING_3']);
  assert.equal(reqs.filter((r) => r.createParagraphBullets).length, 1);
});
