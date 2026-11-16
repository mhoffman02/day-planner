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
import { makeGasContext, loadGasFile, toHost, stubPrimaryTimeZone } from './helpers/gasRuntimeStubs.js';

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

// ---------------------------------------------------------------- no silent CalendarApp fallback
test('getDailyData without the Calendar Advanced Service warns loudly instead of returning no events', () => {
  const ctx = makeGasContext();
  delete ctx.Calendar;
  loadGasFile(ctx, 'Code.gs');
  const day = toHost(ctx.getDailyData('2026-10-09'));
  assert.deepEqual(day.calendarEvents, []);
  assert.ok(day.warnings.some((w) => /calendar/i.test(w) && /not available|not enabled/i.test(w)), JSON.stringify(day.warnings));
});
