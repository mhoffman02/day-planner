/**
 * @file calendarMutationKillers.test.js
 * @description Targeted assertions that kill Stryker survivors in src/calendarEngine.js.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateScheduleGrid,
  mapEventsToGrid,
  formatEventModalPayload,
  generateMonthlyCalendarGrid,
  formatEventDescriptionHtml,
  extractMeetLink
} from '../src/calendarEngine.js';

describe('generateScheduleGrid exact shape', () => {
  const grid = generateScheduleGrid();
  it('every slot has exact keys, display text and half-hour flags', () => {
    const expected = [];
    for (let h = 7; h < 19; h++) {
      const hh = String(h).padStart(2, '0');
      const disp = h > 12 ? h - 12 : h;
      const ap = h >= 12 ? 'PM' : 'AM';
      expected.push({ timeKey: `${hh}:00`, displayTime: `${disp}:00 ${ap}`, isHalfHour: false, events: [] });
      expected.push({ timeKey: `${hh}:30`, displayTime: `${disp}:30 ${ap}`, isHalfHour: true, events: [] });
    }
    expected.push({ timeKey: '19:00', displayTime: '7:00 PM', isHalfHour: false, events: [] });
    assert.deepEqual(grid, expected);
  });
  it('noon is PM and 12 stays 12, 13:00 becomes 1 PM, 11:30 is AM', () => {
    const by = Object.fromEntries(grid.map(s => [s.timeKey, s.displayTime]));
    assert.equal(by['11:30'], '11:30 AM');
    assert.equal(by['12:00'], '12:00 PM');
    assert.equal(by['12:30'], '12:30 PM');
    assert.equal(by['13:00'], '1:00 PM');
    assert.equal(by['18:30'], '6:30 PM');
    assert.equal(by['09:00'], '9:00 AM');
  });
  it('slot event arrays are distinct instances', () => {
    assert.notEqual(grid[0].events, grid[1].events);
    assert.notEqual(generateScheduleGrid()[0].events, grid[0].events);
  });
});

describe('mapEventsToGrid', () => {
  const base = generateScheduleGrid();
  it('defaults to empty grid and no events', () => {
    assert.deepEqual(mapEventsToGrid(), []);
    assert.equal(mapEventsToGrid(base).length, 25);
    assert.ok(mapEventsToGrid(base).every(s => s.events.length === 0));
  });
  it('does not mutate source slots and clears pre-existing events', () => {
    const src = [{ timeKey: '09:00', displayTime: 'x', isHalfHour: false, events: [{ id: 'old' }] }];
    const out = mapEventsToGrid(src, []);
    assert.deepEqual(out[0].events, []);
    assert.equal(src[0].events.length, 1);
    assert.notEqual(out[0], src[0]);
  });
  it('minute 0, 29 go to :00; 30, 59 go to :30', () => {
    const mk = (m, id) => ({ id, title: id, startTime: `2026-03-05T09:${String(m).padStart(2, '0')}:00`, endTime: '2026-03-05T10:59:00' });
    const out = mapEventsToGrid(base, [mk(0, 'a'), mk(29, 'b'), mk(30, 'c'), mk(59, 'd')]);
    const at = k => out.find(s => s.timeKey === k).events.map(e => e.id);
    assert.deepEqual(at('09:00'), ['a', 'b']);
    assert.deepEqual(at('09:30'), ['c', 'd']);
    assert.equal(out.reduce((n, s) => n + s.events.length, 0), 4);
  });
  it('pads single-digit hours and ignores events outside the grid', () => {
    const out = mapEventsToGrid(base, [
      { id: 'early', startTime: '2026-03-05T07:05:00', endTime: '2026-03-05T08:00:00' },
      { id: 'late', startTime: '2026-03-05T22:00:00', endTime: '2026-03-05T23:00:00' },
      { id: 'pm', startTime: '2026-03-05T19:00:00', endTime: '2026-03-05T19:30:00' }
    ]);
    assert.deepEqual(out.find(s => s.timeKey === '07:00').events.map(e => e.id), ['early']);
    assert.deepEqual(out.find(s => s.timeKey === '19:00').events.map(e => e.id), ['pm']);
    assert.equal(out.reduce((n, s) => n + s.events.length, 0), 2);
  });
  it('mapped events are formatted payloads', () => {
    const out = mapEventsToGrid(base, [{ id: 'z', startTime: '2026-03-05T10:00:00', endTime: '2026-03-05T11:00:00' }]);
    const e = out.find(s => s.timeKey === '10:00').events[0];
    assert.equal(e.title, 'Untitled Event');
    assert.ok('gCalLink' in e && 'formattedTime' in e);
  });
});

describe('extractMeetLink', () => {
  it('null/undefined/default input', () => {
    assert.equal(extractMeetLink(null), null);
    assert.equal(extractMeetLink(), null);
    assert.equal(extractMeetLink({}), null);
  });
  it('meetLink wins, trimmed; blank/non-string skipped', () => {
    assert.equal(extractMeetLink({ meetLink: '  https://m/x  ', hangoutLink: 'https://h' }), 'https://m/x');
    assert.equal(extractMeetLink({ meetLink: '   ', hangoutLink: ' https://h ' }), 'https://h');
    assert.equal(extractMeetLink({ meetLink: 5, hangoutLink: 'https://h' }), 'https://h');
    assert.equal(extractMeetLink({ meetLink: '', hangoutLink: '' }), null);
    assert.equal(extractMeetLink({ hangoutLink: '   ' }), null);
    assert.equal(extractMeetLink({ hangoutLink: 7 }), null);
  });
  it('getHangoutLink used, trimmed; falsy/blank/non-string falls through', () => {
    assert.equal(extractMeetLink({ getHangoutLink: () => '  https://g  ' }), 'https://g');
    assert.equal(extractMeetLink({ getHangoutLink: () => '   ' }), null);
    assert.equal(extractMeetLink({ getHangoutLink: () => '' }), null);
    assert.equal(extractMeetLink({ getHangoutLink: () => 42 }), null);
    assert.equal(extractMeetLink({ getHangoutLink: () => null, description: 'meet.google.com/abc-def' }), 'https://meet.google.com/abc-def');
    assert.equal(extractMeetLink({ getHangoutLink: 'notfn' }), null);
  });
  it('getHangoutLink throwing logs context + stack and falls back', () => {
    const orig = console.error;
    const calls = [];
    console.error = (...a) => calls.push(a);
    try {
      const out = extractMeetLink({ getHangoutLink() { throw new Error('boom'); }, description: 'meet.google.com/aaa-bbb' });
      assert.equal(out, 'https://meet.google.com/aaa-bbb');
    } finally {
      console.error = orig;
    }
    assert.equal(calls.length, 1);
    assert.match(calls[0][0], /getHangoutLink\(\) threw/);
    assert.match(calls[0][1], /boom/);
  });
  it('conferenceData entry points: video type, meet uri, trimming, skipping', () => {
    assert.equal(extractMeetLink({ conferenceData: { entryPoints: [{ entryPointType: 'video', uri: ' https://v/1 ' }] } }), 'https://v/1');
    assert.equal(extractMeetLink({ conferenceData: { entryPoints: [{ entryPointType: 'phone', uri: 'tel:1' }, { entryPointType: 'more', uri: 'https://meet.google.com/zzz' }] } }), 'https://meet.google.com/zzz');
    assert.equal(extractMeetLink({ conferenceData: { entryPoints: [{ entryPointType: 'phone', uri: 'tel:1' }] } }), null);
    assert.equal(extractMeetLink({ conferenceData: { entryPoints: [null, { entryPointType: 'video', uri: '   ' }, { entryPointType: 'video' }, { entryPointType: 'video', uri: 9 }, { entryPointType: 'video', uri: 'https://ok' }] } }), 'https://ok');
    assert.equal(extractMeetLink({ conferenceData: { entryPoints: [{ entryPointType: 'video', uri: '   ' }] } }), null);
    assert.equal(extractMeetLink({ conferenceData: { entryPoints: 'x' }, description: 'meet.google.com/q-r' }), 'https://meet.google.com/q-r');
    assert.equal(extractMeetLink({ conferenceData: {} }), null);
    assert.equal(extractMeetLink({ conferenceData: { entryPoints: [{ uri: 'tel:555' }] } }), null);
  });
  it('text scan: title, location, description via fields and getters', () => {
    assert.equal(extractMeetLink({ title: 'Join meet.google.com/t-1' }), 'https://meet.google.com/t-1');
    assert.equal(extractMeetLink({ summary: 'Join meet.google.com/s-1' }), 'https://meet.google.com/s-1');
    assert.equal(extractMeetLink({ location: 'meet.google.com/l-1' }), 'https://meet.google.com/l-1');
    assert.equal(extractMeetLink({ description: 'meet.google.com/d-1' }), 'https://meet.google.com/d-1');
    assert.equal(extractMeetLink({ getTitle: () => 'meet.google.com/gt-1' }), 'https://meet.google.com/gt-1');
    assert.equal(extractMeetLink({ getLocation: () => 'meet.google.com/gl-1' }), 'https://meet.google.com/gl-1');
    assert.equal(extractMeetLink({ getDescription: () => 'meet.google.com/gd-1' }), 'https://meet.google.com/gd-1');
    assert.equal(extractMeetLink({ getTitle: () => '', title: 'meet.google.com/ft-1' }), 'https://meet.google.com/ft-1');
    assert.equal(extractMeetLink({ getLocation: () => '', location: 'meet.google.com/fl-1' }), 'https://meet.google.com/fl-1');
    assert.equal(extractMeetLink({ getDescription: () => '', description: 'meet.google.com/fd-1' }), 'https://meet.google.com/fd-1');
    assert.equal(extractMeetLink({ getTitle: () => '', title: '', summary: 'meet.google.com/fs-1' }), 'https://meet.google.com/fs-1');
  });
  it('text scan joins fields with spaces so adjacent fields do not merge', () => {
    assert.equal(extractMeetLink({ title: 'x', location: 'meet.google.com/ab', description: 'cd' }), 'https://meet.google.com/ab');
  });
  it('url regex: scheme kept, case-insensitive, stops at delimiters, query kept', () => {
    assert.equal(extractMeetLink({ description: 'http://meet.google.com/abc-d' }), 'http://meet.google.com/abc-d');
    assert.equal(extractMeetLink({ description: 'https://meet.google.com/abc-d' }), 'https://meet.google.com/abc-d');
    assert.equal(extractMeetLink({ description: 'HTTPS://MEET.GOOGLE.COM/ABC' }), 'HTTPS://MEET.GOOGLE.COM/ABC');
    assert.equal(extractMeetLink({ description: 'MEET.GOOGLE.COM/ABC' }), 'https://MEET.GOOGLE.COM/ABC');
    assert.equal(extractMeetLink({ description: 'see meet.google.com/a_b-c9, ok' }), 'https://meet.google.com/a_b-c9');
    assert.equal(extractMeetLink({ description: 'meet.google.com/abc?authuser=1&x=2 tail' }), 'https://meet.google.com/abc?authuser=1&x=2');
    assert.equal(extractMeetLink({ description: 'meet.google.com/abc?q=1"z' }), 'https://meet.google.com/abc?q=1');
    assert.equal(extractMeetLink({ description: "meet.google.com/abc?q=1'z" }), 'https://meet.google.com/abc?q=1');
    assert.equal(extractMeetLink({ description: 'meet.google.com/abc?q=1<z' }), 'https://meet.google.com/abc?q=1');
    assert.equal(extractMeetLink({ description: 'meet.google.com/abc?q=1>z' }), 'https://meet.google.com/abc?q=1');
    assert.equal(extractMeetLink({ description: 'meet.google.com/' }), null);
    assert.equal(extractMeetLink({ description: 'meet.google.com/abc.def' }), 'https://meet.google.com/abc');
    assert.equal(extractMeetLink({ description: 'meetXgoogle.com/abc' }), null);
    assert.equal(extractMeetLink({ description: 'nothing here' }), null);
  });
});

describe('formatEventModalPayload', () => {
  it('defaults: all-day, untitled, empty strings, today link, random id', () => {
    const p = formatEventModalPayload();
    assert.equal(p.title, 'Untitled Event');
    assert.equal(p.formattedTime, 'All Day');
    assert.equal(p.location, '');
    assert.equal(p.description, '');
    assert.deepEqual(p.attendees, []);
    assert.equal(p.meetLink, null);
    assert.equal(p.startTime, undefined);
    assert.match(p.id, /^evt_[a-z0-9]{1,6}$/);
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    assert.equal(p.gCalLink, `https://calendar.google.com/calendar/r/day/${y}/${m}/${dd}`);
  });
  it('ids differ between calls and are short', () => {
    const ids = new Set();
    for (let i = 0; i < 30; i++) ids.add(formatEventModalPayload({}).id);
    assert.ok(ids.size > 20);
    for (const id of ids) assert.ok(id.length >= 9 && id.length <= 10, id);
  });
  it('passes fields through and builds gCalLink from start date', () => {
    const p = formatEventModalPayload({
      id: 'e1', title: 'T', startTime: '2026-03-05T09:00:00', endTime: '2026-03-05T10:00:00',
      location: 'L', description: 'D', attendees: ['a@b.c']
    });
    assert.equal(p.id, 'e1');
    assert.equal(p.title, 'T');
    assert.equal(p.startTime, '2026-03-05T09:00:00');
    assert.equal(p.endTime, '2026-03-05T10:00:00');
    assert.equal(p.location, 'L');
    assert.equal(p.description, 'D');
    assert.deepEqual(p.attendees, ['a@b.c']);
    assert.equal(p.gCalLink, 'https://calendar.google.com/calendar/r/day/2026/03/05');
    const s = new Date('2026-03-05T09:00:00').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const e = new Date('2026-03-05T10:00:00').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    assert.equal(p.formattedTime, `${s} - ${e}`);
  });
  it('All Day when only one of start/end is present', () => {
    assert.equal(formatEventModalPayload({ startTime: '2026-03-05T09:00:00' }).formattedTime, 'All Day');
    assert.equal(formatEventModalPayload({ endTime: '2026-03-05T09:00:00' }).formattedTime, 'All Day');
  });
  it('gCalLink precedence: htmlLink, then gCalLink, then generated; replaces all dashes', () => {
    assert.equal(formatEventModalPayload({ htmlLink: 'H', gCalLink: 'G' }).gCalLink, 'H');
    assert.equal(formatEventModalPayload({ gCalLink: 'G' }).gCalLink, 'G');
    assert.equal(formatEventModalPayload({ startTime: '2026-12-31T00:00:00' }).gCalLink, 'https://calendar.google.com/calendar/r/day/2026/12/31');
  });
  it('date-only startTime uses its first 10 chars', () => {
    assert.equal(formatEventModalPayload({ startTime: '2026-07-04' }).gCalLink, 'https://calendar.google.com/calendar/r/day/2026/07/04');
  });
  it('meetLink derived from raw event', () => {
    assert.equal(formatEventModalPayload({ hangoutLink: 'https://h' }).meetLink, 'https://h');
  });
});

describe('formatEventDescriptionHtml', () => {
  it('empty / default input yields empty string', () => {
    assert.equal(formatEventDescriptionHtml(), '');
    assert.equal(formatEventDescriptionHtml(''), '');
    assert.equal(formatEventDescriptionHtml(null), '');
  });
  it('plain text escaped in pre with all five entities', () => {
    assert.equal(formatEventDescriptionHtml('a&b <3 "q" \'z\' >'), '<pre>a&amp;b &lt;3 &quot;q&quot; &#39;z&#39; &gt;</pre>');
    assert.equal(formatEventDescriptionHtml('&&<<>>""\'\''), '<pre>&amp;&amp;&lt;&lt;&gt;&gt;&quot;&quot;&#39;&#39;</pre>');
  });
  it('tag detection: needs a letter after <, case-insensitive, spans newlines', () => {
    assert.equal(formatEventDescriptionHtml('1 < 2 > 0'), '<pre>1 &lt; 2 &gt; 0</pre>');
    assert.equal(formatEventDescriptionHtml('x <B>bold</B>'), 'x <b>bold</b>');
    assert.equal(formatEventDescriptionHtml('<p\nclass="a">hi</p>'), '<p>hi</p>');
    assert.equal(formatEventDescriptionHtml('a <3 b>'), '<pre>a &lt;3 b&gt;</pre>');
    assert.equal(formatEventDescriptionHtml('a <b'), '<pre>a &lt;b</pre>');
  });
  it('strips script and style blocks (multiline, case-insensitive), all occurrences', () => {
    assert.equal(formatEventDescriptionHtml('<b>a</b><script>x()\n</script>b<SCRIPT>y</SCRIPT>c'), '<b>a</b>bc');
    assert.equal(formatEventDescriptionHtml('<b>a</b><style>p{}\n</style>b<STYLE>q</STYLE>c'), '<b>a</b>bc');
  });
  it('strips on* handlers with all quoting styles, and every other attribute (allowlist)', () => {
    assert.equal(formatEventDescriptionHtml('<b onclick="x()">t</b>'), '<b>t</b>');
    assert.equal(formatEventDescriptionHtml('<b onclick=\'x()\'>t</b>'), '<b>t</b>');
    assert.equal(formatEventDescriptionHtml('<b onclick=x()>t</b>'), '<b>t</b>');
    assert.equal(formatEventDescriptionHtml('<b ONCLICK = "x()" id="k">t</b>'), '<b>t</b>');
    assert.equal(formatEventDescriptionHtml('<b onclick="x()" onmouseover="y()">t</b>'), '<b>t</b>');
    assert.equal(formatEventDescriptionHtml('<b data-onx="1">t</b>'), '<b>t</b>');
    assert.equal(formatEventDescriptionHtml('<b\nonclick="x()">t</b>'), '<b>t</b>');
    assert.equal(formatEventDescriptionHtml('<b onclick=x() id=3>t</b>'), '<b>t</b>');
  });
  it('drops non-allowlisted tags and every href/src that is not on an anchor or not http(s)/mailto', () => {
    assert.equal(formatEventDescriptionHtml('<img src="javascript:alert(1)">'), '');
    assert.equal(formatEventDescriptionHtml('<img src=\'data:text/html,x\'>'), '');
    assert.equal(formatEventDescriptionHtml('<i href = " JavaScript:alert(1)">'), '<i></i>');
    assert.equal(formatEventDescriptionHtml('<i href="DATA:x">'), '<i></i>');
    assert.equal(formatEventDescriptionHtml('<i href="https://ok/javascript:x">'), '<i></i>');
    assert.equal(formatEventDescriptionHtml('<i href="javascript:a" title="t">'), '<i></i>');
  });
  it('anchors always get forced target and rel; only absolute http(s)/mailto hrefs survive', () => {
    assert.equal(formatEventDescriptionHtml('<a href="https://x">l</a>'), '<a href="https://x" target="_blank" rel="noopener noreferrer">l</a>');
    assert.equal(formatEventDescriptionHtml('<A href="https://x">l</A>'), '<a href="https://x" target="_blank" rel="noopener noreferrer">l</a>');
    assert.equal(formatEventDescriptionHtml('<a target="_self" href="x">l</a>'), '<a target="_blank" rel="noopener noreferrer">l</a>');
    assert.equal(formatEventDescriptionHtml('<a href="x" target="_self">l</a>'), '<a target="_blank" rel="noopener noreferrer">l</a>');
    assert.equal(formatEventDescriptionHtml('<a>l</a>'), '<a target="_blank" rel="noopener noreferrer">l</a>');
    assert.equal(formatEventDescriptionHtml('<a href="x">l</a> <a href="y">m</a>'), '<a target="_blank" rel="noopener noreferrer">l</a> <a target="_blank" rel="noopener noreferrer">m</a>');
  });
});

describe('generateMonthlyCalendarGrid', () => {
  it('Feb 2026 starts Sunday: 28 cells, no padding', () => {
    const g = generateMonthlyCalendarGrid(2026, 2);
    assert.equal(g.length, 28);
    assert.equal(g[0].dateStr, '2026-02-01');
    assert.equal(g[27].dateStr, '2026-02-28');
  });
  it('Mar 2026: leading pad 0, 31 days, 4 trailing pad', () => {
    const g = generateMonthlyCalendarGrid(2026, 3);
    assert.equal(g.length, 35);
    assert.deepEqual(g.slice(31).map(c => [c.dateStr, c.dayNumber, c.isCurrentMonth, c.events.length]),
      [['', 1, false, 0], ['', 2, false, 0], ['', 3, false, 0], ['', 4, false, 0]]);
  });
  it('Oct 2026 (starts Thu): leading pad numbers from previous month end, trailing to 35', () => {
    const g = generateMonthlyCalendarGrid(2026, 10);
    assert.deepEqual(g.slice(0, 4).map(c => [c.dateStr, c.dayNumber, c.isCurrentMonth]),
      [['', 27, false], ['', 28, false], ['', 29, false], ['', 30, false]]);
    assert.equal(g[4].dateStr, '2026-10-01');
    assert.equal(g[4].dayNumber, 1);
    assert.equal(g[4].isCurrentMonth, true);
    assert.equal(g.length, 35);
    assert.equal(g[34].dateStr, '2026-10-31');
  });
  it('Jan 2026 leading pad wraps to December (31 days)', () => {
    const g = generateMonthlyCalendarGrid(2026, 1);
    assert.deepEqual(g.slice(0, 4).map(c => c.dayNumber), [28, 29, 30, 31]);
    assert.equal(g.length, 35);
  });
  it('Mar 2027 has leading pad from Feb of non-leap year', () => {
    const g = generateMonthlyCalendarGrid(2027, 3);
    assert.equal(g[0].dayNumber, 28);
    assert.equal(g[0].isCurrentMonth, false);
    assert.equal(g[1].dateStr, '2027-03-01');
  });
  it('leap February and 42-cell month; trailing cells counted from 1', () => {
    const feb = generateMonthlyCalendarGrid(2024, 2);
    assert.equal(feb.filter(c => c.isCurrentMonth).length, 29);
    assert.equal(feb.length, 35);
    const aug = generateMonthlyCalendarGrid(2026, 8);
    assert.equal(aug.length, 42);
    assert.deepEqual(aug.slice(37).map(c => c.dayNumber), [1, 2, 3, 4, 5]);
    assert.ok(aug.slice(37).every(c => c.dateStr === '' && !c.isCurrentMonth && c.events.length === 0));
  });
  it('dateStr zero-pads month and day', () => {
    const g = generateMonthlyCalendarGrid(2026, 9);
    assert.equal(g.find(c => c.dayNumber === 5 && c.isCurrentMonth).dateStr, '2026-09-05');
    assert.equal(g.find(c => c.dayNumber === 30 && c.isCurrentMonth).dateStr, '2026-09-30');
  });
  it('events are bucketed by local date; no-start and other months excluded', () => {
    const evts = [
      { id: 'a', startTime: '2026-03-05T09:00:00' },
      { id: 'b', startTime: '2026-03-05T23:59:00' },
      { id: 'c', startTime: '2026-03-06T00:00:00' },
      { id: 'd' },
      { id: 'e', startTime: '2026-04-05T09:00:00' }
    ];
    const g = generateMonthlyCalendarGrid(2026, 3, evts);
    const ids = ds => g.find(c => c.dateStr === ds).events.map(e => e.id);
    assert.deepEqual(ids('2026-03-05'), ['a', 'b']);
    assert.deepEqual(ids('2026-03-06'), ['c']);
    assert.deepEqual(ids('2026-03-07'), []);
    assert.equal(g.reduce((n, c) => n + c.events.length, 0), 3);
    assert.ok(g.filter(c => !c.isCurrentMonth).every(c => c.events.length === 0));
  });
});

describe('second-pass killers', () => {
  const silenced = fn => {
    const orig = console.error;
    const calls = [];
    console.error = (...a) => calls.push(a);
    try { fn(); } finally { console.error = orig; }
    return calls;
  };
  it('non-function or non-string getHangoutLink never throws or logs', () => {
    const calls = silenced(() => {
      assert.equal(extractMeetLink({ getHangoutLink: 'notfn' }), null);
      assert.equal(extractMeetLink({ getHangoutLink: () => 42 }), null);
      assert.equal(extractMeetLink({ getHangoutLink: () => null }), null);
      assert.equal(extractMeetLink({ getHangoutLink: () => undefined }), null);
    });
    assert.deepEqual(calls, []);
  });
  it('scheme check is anchored: https:// inside the query does not suppress prefix', () => {
    assert.equal(extractMeetLink({ description: 'meet.google.com/a?u=https://x.y' }), 'https://meet.google.com/a?u=https://x.y');
  });
  it('quoted on* values containing spaces are fully stripped', () => {
    assert.equal(formatEventDescriptionHtml('<b onclick="a b c">t</b>'), '<b>t</b>');
    assert.equal(formatEventDescriptionHtml('<b onclick=\'a b c\'>t</b>'), '<b>t</b>');
    assert.equal(formatEventDescriptionHtml('<b onclick="a b" id="k">t</b>'), '<b>t</b>');
    assert.equal(formatEventDescriptionHtml('<b onclick=\'a"b c\'>t</b>'), '<b>t</b>');
    assert.equal(formatEventDescriptionHtml('<b onclick="a\'b c">t</b>'), '<b>t</b>');
  });
  it('leading padding cells carry empty event arrays', () => {
    const g = generateMonthlyCalendarGrid(2026, 10);
    assert.deepEqual(g.slice(0, 4).map(c => c.events), [[], [], [], []]);
  });
});
