/**
 * @file calendarLeastPrivilege.test.js
 * @description Calendar runs on the calendar.events scope only (2026-11-13). The broad `calendar` scope can
 * change sharing (ACLs) and delete whole calendars; nothing here needs that. So: no CalendarApp (the built-in
 * service demands the broad scope), no calendar-level Advanced Service calls (Calendars, CalendarList, Settings,
 * Acl, Colors, Freebusy), and the primary-calendar time zone comes from the events.list response (`timeZone`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeGasContext, loadGasFile, toHost, stubPrimaryTimeZone, formatDateInZone } from './helpers/gasRuntimeStubs.js';

const gasDir = path.join(import.meta.dirname, '..', 'gas-app');
const gasFiles = fs.readdirSync(gasDir).filter((f) => /\.(gs|html)$/.test(f));
const TZ = 'America/Chicago';

test('no gas-app file uses CalendarApp or a calendar-level Calendar API (only Calendar.Events)', () => {
  for (const f of gasFiles) {
    const src = fs.readFileSync(path.join(gasDir, f), 'utf8');
    assert.doesNotMatch(src, /\bCalendarApp\b/, f + ' uses CalendarApp, which needs the broad calendar scope');
    assert.doesNotMatch(src, /\bCalendar\.(Calendars|CalendarList|Settings|Acl|Colors|Freebusy)\b/, f + ' calls a Calendar API outside calendar.events');
  }
});

test('appsscript.json asks for calendar.events and no other Calendar scope', () => {
  const m = JSON.parse(fs.readFileSync(path.join(gasDir, 'appsscript.json'), 'utf8'));
  const cal = m.oauthScopes.filter((s) => /\/auth\/calendar/.test(s));
  assert.deepEqual(cal, ['https://www.googleapis.com/auth/calendar.events']);
  assert.ok(m.dependencies.enabledAdvancedServices.some((s) => s.userSymbol === 'Calendar' && s.serviceId === 'calendar' && s.version === 'v3'));
});

function calCtx(probe) {
  const ctx = makeGasContext();
  ctx.Calendar.Calendars = { get: () => { throw new Error('Calendars.get needs the broad calendar scope'); } };
  ctx.Calendar.Settings = { get: () => { throw new Error('Settings.get needs calendar.readonly'); } };
  const inserts = [];
  ctx.Calendar.Events.insert = (resource, calendarId) => {
    inserts.push({ resource: toHost(resource), calendarId });
    return { id: 'n1', summary: resource.summary, start: { dateTime: resource.start.dateTime + '-05:00' }, end: { dateTime: resource.end.dateTime + '-05:00' } };
  };
  const probes = stubPrimaryTimeZone(ctx, probe || (() => ({ timeZone: TZ })));
  loadGasFile(ctx, 'Code.gs');
  return { ctx, inserts, probes };
}

test('the primary time zone comes from events.list on primary (fields timeZone), not Calendars.get', () => {
  const { ctx, inserts, probes } = calCtx();
  ctx.createCalendarEvent({ title: 'Review', dateStr: '2026-10-09', startTime: '09:00', endTime: '10:00' });
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].resource.start.timeZone, TZ);
  assert.equal(probes.length, 1);
  assert.equal(probes[0].calendarId, 'primary');
  assert.equal(probes[0].params.fields, 'timeZone');
});

test('time zone probe failure fails closed with the stack logged (no script-zone fallback)', () => {
  const { ctx, inserts } = calCtx(() => { throw new Error('events.list 503'); });
  assert.throws(() => ctx.createCalendarEvent({ title: 'Review', dateStr: '2026-10-09', startTime: '09:00', endTime: '10:00' }), /time zone/i);
  assert.equal(inserts.length, 0);
  assert.match(ctx.__consoleLines.join('\n'), /events\.list 503[\s\S]*\n\s+at /);
});

// ---------------------------------------------------------------- 2-Way Sync (was CalendarApp tags)
function syncCtx(o = {}) {
  const ctx = makeGasContext();
  const today = formatDateInZone(new Date(), 'America/New_York', 'yyyy-MM-dd');
  const at = (hh) => today + 'T' + hh + ':00-05:00';
  ctx.__fakes.tasks.push(
    { id: 'T1', title: 'Write memo', status: 'completed', due: today + 'T00:00:00.000Z', notes: '' },
    { id: 'T2', title: 'Call vendor', status: 'needsAction', due: today + 'T00:00:00.000Z', notes: '' },
    { id: 'T3', title: 'Already synced', status: 'needsAction', due: today + 'T00:00:00.000Z', notes: '' }
  );
  const tagged = (id, summary, taskId) => ({ id, summary, start: { dateTime: at('09:00') }, end: { dateTime: at('09:30') }, organizer: { self: true }, extendedProperties: { shared: { gasTaskId: taskId } } });
  ctx.__fakes.events.push(tagged('E1', 'Write memo', 'T1'), tagged('E2', '[✓] Call vendor', 'T2'), tagged('E3', 'Already synced', 'T3'),
    { id: 'E4', summary: 'Untagged', start: { dateTime: at('11:00') }, end: { dateTime: at('12:00') } });
  stubPrimaryTimeZone(ctx, () => ({ timeZone: 'America/New_York' }));
  const patches = [];
  ctx.Calendar.Events.patch = (resource, calendarId, eventId, opts) => {
    patches.push({ resource: toHost(resource), calendarId, eventId, opts: toHost(opts) });
    if (o.failOn === eventId) throw new Error('Forbidden: ' + eventId);
    return { id: eventId, summary: resource.summary };
  };
  loadGasFile(ctx, 'Code.gs');
  return { ctx, patches };
}

test('syncWorkspaceChanges retitles tagged events through Calendar.Events.patch, skipping unchanged ones', () => {
  const { ctx, patches } = syncCtx();
  ctx.syncWorkspaceChanges();
  const byId = Object.fromEntries(patches.map((p) => [p.eventId, p]));
  assert.deepEqual(Object.keys(byId).sort(), ['E1', 'E2'], 'only events whose title must change are written');
  assert.deepEqual(byId.E1.resource, { summary: '[✓] Write memo' });
  assert.deepEqual(byId.E2.resource, { summary: 'Call vendor' });
  for (const p of patches) {
    assert.equal(p.calendarId, 'primary');
    assert.equal(p.opts.sendUpdates, 'none', 'a retitle never emails guests');
  }
});

test('syncWorkspaceChanges: one failed patch is logged with its stack and the rest still sync', () => {
  const { ctx, patches } = syncCtx({ failOn: 'E1' });
  ctx.syncWorkspaceChanges();
  assert.ok(patches.some((p) => p.eventId === 'E2'), 'E2 still patched after E1 failed');
  assert.match(ctx.__consoleLines.join('\n'), /syncWorkspaceChanges[\s\S]*Forbidden: E1[\s\S]*\n\s+at /);
});

// ---------------------------------------------------------------- no silent CalendarApp fallback
test('getDailyData without the Calendar Advanced Service warns loudly instead of returning no events', () => {
  const ctx = makeGasContext();
  delete ctx.Calendar;
  loadGasFile(ctx, 'Code.gs');
  const day = toHost(ctx.getDailyData('2026-10-09'));
  assert.deepEqual(day.calendarEvents, []);
  assert.ok(day.warnings.some((w) => /calendar/i.test(w) && /not available|not enabled/i.test(w)), JSON.stringify(day.warnings));
});
