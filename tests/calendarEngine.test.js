/**
 * @file calendarEngine.test.js
 * @description Unit tests for calendar grid generation, event mapping, payload formatting, and monthly view matrix.
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

describe('Calendar Engine Unit Tests', () => {
  it('should generate 25 half-hourly schedule slots from 07:00 AM to 07:00 PM', () => {
    const grid = generateScheduleGrid();
    assert.equal(grid.length, 25);
    assert.equal(grid[0].displayTime, '7:00 AM');
    assert.equal(grid[0].timeKey, '07:00');
    assert.equal(grid[1].displayTime, '7:30 AM');
    assert.equal(grid[1].timeKey, '07:30');
    assert.equal(grid[24].displayTime, '7:00 PM');
    assert.equal(grid[24].timeKey, '19:00');
  });

  it('should format event modal payload with Meet and gCal links', () => {
    const rawEvt = {
      id: 'e100',
      title: 'Executive Sync',
      startTime: '2026-08-15T09:00:00Z',
      endTime: '2026-08-15T10:00:00Z',
      location: 'Boardroom A',
      description: 'Discuss Q3 goals',
      meetLink: 'https://meet.google.com/abc-defg-hij',
      attendees: ['alice@example.com', 'bob@example.com']
    };

    const payload = formatEventModalPayload(rawEvt);
    assert.equal(payload.id, 'e100');
    assert.equal(payload.title, 'Executive Sync');
    assert.equal(payload.meetLink, 'https://meet.google.com/abc-defg-hij');
    assert.ok(payload.gCalLink.includes('calendar.google.com'));
    assert.equal(payload.attendees.length, 2);
  });

  it('should map events onto correct schedule slots', () => {
    const grid = generateScheduleGrid();
    const mockEvents = [
      {
        id: 'e1',
        title: 'Morning Standup',
        startTime: '2026-08-15T08:30:00Z',
        endTime: '2026-08-15T09:00:00Z'
      }
    ];

    // Create a local date for matching
    const sampleDate = new Date();
    sampleDate.setHours(8, 30, 0, 0);
    mockEvents[0].startTime = sampleDate.toISOString();

    const mappedGrid = mapEventsToGrid(grid, mockEvents);
    const slot0830 = mappedGrid.find(s => s.timeKey === '08:30');
    assert.ok(slot0830);
    assert.equal(slot0830.events.length, 1);
    assert.equal(slot0830.events[0].title, 'Morning Standup');
  });

  it('should generate monthly calendar grid matrix with proper padding and events', () => {
    const events = [
      { title: 'Project Kickoff', startTime: '2026-08-15T10:00:00Z' }
    ];

    const grid = generateMonthlyCalendarGrid(2026, 8, events);
    assert.equal(grid.length % 7, 0); // Must be multiples of 7
    const aug15 = grid.find(d => d.dateStr === '2026-08-15');
    assert.ok(aug15);
    assert.equal(aug15.dayNumber, 15);
    assert.equal(aug15.isCurrentMonth, true);
    assert.equal(aug15.events.length, 1);
  });

  it('should escape and wrap a plain-text description in <pre> so line breaks survive', () => {
    const html = formatEventDescriptionHtml('Line one\nLine two <not-really-a-tag');
    assert.equal(html, '<pre>Line one\nLine two &lt;not-really-a-tag</pre>');
  });

  it('should render an HTML-bearing description as HTML and ensure links open in new tab', () => {
    const html = formatEventDescriptionHtml('Call in via <a href="https://meet.example.com">this link</a><br>Bring notes');
    assert.ok(html.includes('href="https://meet.example.com"'));
    assert.ok(html.includes('target="_blank"'));
    assert.ok(html.includes('<br>'));
  });

  it('should strip script/style blocks and inline event-handler attributes from HTML descriptions', () => {
    const html = formatEventDescriptionHtml('<img src=x onerror="alert(1)"><script>alert(2)</script><b onclick="evil()">hi</b>');
    assert.ok(!html.includes('onerror'));
    assert.ok(!html.includes('onclick'));
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('alert(2)'));
  });

  it('should neutralize javascript: URIs in href/src attributes of HTML descriptions', () => {
    const html = formatEventDescriptionHtml('<a href="javascript:alert(1)">click</a>');
    assert.ok(!html.includes('javascript:'));
  });

  it('should return an empty string for an empty/missing description', () => {
    assert.equal(formatEventDescriptionHtml(''), '');
    assert.equal(formatEventDescriptionHtml(), '');
  });

  describe('extractMeetLink & Conference Data Detection', () => {
    it('should extract meetLink when explicitly provided', () => {
      const link = extractMeetLink({ meetLink: 'https://meet.google.com/abc-defg-hij' });
      assert.equal(link, 'https://meet.google.com/abc-defg-hij');
    });

    it('should extract meetLink from hangoutLink', () => {
      const link = extractMeetLink({ hangoutLink: 'https://meet.google.com/hgt-link-test' });
      assert.equal(link, 'https://meet.google.com/hgt-link-test');
    });

    it('should extract meetLink from conferenceData entryPoints', () => {
      const evt = {
        conferenceData: {
          entryPoints: [
            { entryPointType: 'phone', uri: 'tel:+1234567890' },
            { entryPointType: 'video', uri: 'https://meet.google.com/ncm-msds-mtg' }
          ]
        }
      };
      const link = extractMeetLink(evt);
      assert.equal(link, 'https://meet.google.com/ncm-msds-mtg');
    });

    it('should extract meetLink from description text', () => {
      const evt = {
        title: 'NCMMS - Daily Standup',
        description: 'Join with Google Meet: https://meet.google.com/xyz-standup-gsa\nOr phone: +1-555-0100'
      };
      const link = extractMeetLink(evt);
      assert.equal(link, 'https://meet.google.com/xyz-standup-gsa');
    });

    it('should extract meetLink from location field', () => {
      const evt = {
        title: 'Team Sync',
        location: 'https://meet.google.com/loc-sync-link'
      };
      const link = extractMeetLink(evt);
      assert.equal(link, 'https://meet.google.com/loc-sync-link');
    });

    it('formatEventModalPayload should automatically populate meetLink from description if not on root', () => {
      const rawEvt = {
        id: 'evt_ncmms',
        title: 'NCMMS - Daily Standup',
        startTime: '2026-08-15T09:00:00Z',
        endTime: '2026-08-15T09:30:00Z',
        description: 'Daily Scrum meeting.\nGoogle Meet: https://meet.google.com/ncm-ms-standup'
      };
      const payload = formatEventModalPayload(rawEvt);
      assert.equal(payload.meetLink, 'https://meet.google.com/ncm-ms-standup');
    });

    it('should extract meetLink without https prefix and prepend https', () => {
      const evt = {
        title: 'NCMMS Daily Standup',
        description: 'Meeting info:\nmeet.google.com/ncm-msds-mtg\nDial in: +1 555-0199'
      };
      const link = extractMeetLink(evt);
      assert.equal(link, 'https://meet.google.com/ncm-msds-mtg');
    });

    it('should extract meetLink with query parameters and preserve or clean them', () => {
      const evt = {
        title: 'Project Review',
        location: 'https://meet.google.com/abc-defg-hij?authuser=0&hs=179'
      };
      const link = extractMeetLink(evt);
      assert.equal(link, 'https://meet.google.com/abc-defg-hij?authuser=0&hs=179');
    });

    it('should extract meetLink from event title if present in parentheses or plain', () => {
      const evt = {
        title: 'Sync (meet.google.com/xyz-uvwx-rst)',
        description: ''
      };
      const link = extractMeetLink(evt);
      assert.equal(link, 'https://meet.google.com/xyz-uvwx-rst');
    });

    it('should extract meetLink using getHangoutLink method if provided', () => {
      const evt = {
        title: 'CalendarApp Event',
        getHangoutLink: () => 'https://meet.google.com/cal-app-meet'
      };
      const link = extractMeetLink(evt);
      assert.equal(link, 'https://meet.google.com/cal-app-meet');
    });

    it('should log the stack loudly and fall back to conferenceData when getHangoutLink throws', (t) => {
      const errorSpy = t.mock.method(console, 'error', () => {});
      const evt = {
        title: 'CalendarApp Event',
        getHangoutLink: () => { throw new Error('unsupported event type'); },
        conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/conf-data' }] }
      };
      assert.equal(extractMeetLink(evt), 'https://meet.google.com/conf-data');
      assert.equal(errorSpy.mock.callCount(), 1);
      const logged = errorSpy.mock.calls[0].arguments.join(' ');
      assert.match(logged, /getHangoutLink/);
      assert.match(logged, /unsupported event type\n\s+at /);
    });

    it('should return null when no meeting link exists anywhere', () => {
      assert.equal(extractMeetLink({ description: 'In-person meeting in Room 4B', location: 'HQ' }), null);
      assert.equal(extractMeetLink(null), null);
    });
  });
});

describe('formatEventDescriptionHtml anchor attributes', () => {
  it('adds target and rel to an anchor whose only match is data-target', () => {
    const out = formatEventDescriptionHtml('<a data-target="1" href="https://x.test">x</a>');
    assert.match(out, /target="_blank" rel="noopener noreferrer"/);
  });

  it('overrides a real target with the forced _blank + noopener noreferrer (allowlist sanitizer)', () => {
    const html = '<a href="https://x.test" target="_self">x</a>';
    assert.equal(formatEventDescriptionHtml(html), '<a href="https://x.test" target="_blank" rel="noopener noreferrer">x</a>');
  });
});

describe('description sanitizer: tag allowlist and dropped content', () => {
  const fmt = formatEventDescriptionHtml;
  it('allows only exact tag names, not suffixes or prefixes of allowed names', () => {
    assert.equal(fmt('<abbr>hi</abbr>'), 'hi');
    assert.equal(fmt('<xspan>hi</xspan>'), 'hi');
    assert.equal(fmt('<pre>hi</pre>'), 'hi');
  });
  it('drops content only for exact script-like names', () => {
    assert.equal(fmt('<xscript>keep</xscript>'), 'keep');
    assert.equal(fmt('<scriptx>keep</scriptx>'), 'keep');
    assert.equal(fmt('<p>a</p><script>bad()</script>after'), '<p>a</p>after');
    assert.equal(fmt('<script>1/script>2</script>3'), '3');
    assert.equal(fmt('<style>x</style>y'), 'y');
  });
  it('drops an unclosed script to the end and survives a closer without ">"', () => {
    assert.equal(fmt('a<script>b'), 'a');
    assert.equal(fmt('x<script>a</script'), 'x');
  });
  it('closes nested tags in order and ignores stray closers', () => {
    assert.equal(fmt('<b><i>x</b>y'), '<b><i>x</i></b>y');
    assert.equal(fmt('<p>a</b>c</p>'), '<p>ac</p>');
    assert.equal(fmt('<p>open'), '<p>open</p>');
  });
  it('br is void: never pushed to the open stack', () => {
    assert.equal(fmt('<p>a<br>b</p>'), '<p>a<br>b</p>');
    assert.equal(fmt('<br>x'), '<br>x');
  });
});

describe('description sanitizer: tokenizer edge cases', () => {
  const fmt = formatEventDescriptionHtml;
  it('removes comments and keeps text around them', () => {
    assert.equal(fmt('<p>a<!-- c -->b</p>'), '<p>ab</p>');
    assert.equal(fmt('<p>a<!-- x > y -->b</p>'), '<p>ab</p>');
    assert.equal(fmt('<p>a<!-- never closed'), '<p>a</p>');
    assert.equal(fmt('<p>a</p><!-->b'), '<p>a</p>');
    assert.equal(fmt('<p>a<!-- x-y -->b</p>'), '<p>ab</p>');
    assert.equal(fmt('<p>a<!-x>b</p>'), '<p>ab</p>');
  });
  it('removes declarations, processing instructions and non-letter closers', () => {
    assert.equal(fmt('<p>a</p><!DOCTYPE html>x'), '<p>a</p>x');
    assert.equal(fmt('<p>a</p><?xml v?>x'), '<p>a</p>x');
    assert.equal(fmt('<p>a</p></ >x'), '<p>a</p>x');
    assert.equal(fmt('<p>a</p></3>abc'), '<p>a</p>abc');
    assert.equal(fmt('<p>a</p></>x'), '<p>a</p>x');
    assert.equal(fmt('<p>a</p><!x>b'), '<p>a</p>b');
    assert.equal(fmt('<p>a</p><!DOCTYPE'), '<p>a</p>');
    assert.equal(fmt('<p>a</p><?x'), '<p>a</p>');
    assert.equal(fmt('<p>a</p></'), '<p>a</p>');
  });
  it('a literal "<" that starts no tag is escaped, even at the end', () => {
    assert.equal(fmt('<p>1 < 2</p>'), '<p>1 &lt; 2</p>');
    assert.equal(fmt('<p>a<'), '<p>a&lt;</p>');
    assert.equal(fmt('<p>a<3b</p>'), '<p>a&lt;3b</p>');
  });
  it('truncated tags drop to the end of input', () => {
    assert.equal(fmt('<p>x</p><a'), '<p>x</p>');
    assert.equal(fmt('<p>x</p><a href'), '<p>x</p>');
    assert.equal(fmt('<p>x</p><a href=foo'), '<p>x</p>');
    assert.equal(fmt('<p>x</p><a href="http://a.com'), '<p>x</p>');
    assert.equal(fmt('<p>x</p><a href= '), '<p>x</p>');
    assert.equal(fmt('<p>x</p><a title=\'v'), '<p>x</p>');
  });
  it('bare ">" in text is escaped', () => {
    assert.equal(fmt('<p>a > b</p>'), '<p>a &gt; b</p>');
  });
  it('escapes bare ampersands but keeps well-formed entities', () => {
    assert.equal(
      fmt('<p>&amp; &#65; &#x4a; &#X4F; &sup2; &lt; | a & b | &amp x | &#65 y | &#xZ; | &;</p>'),
      '<p>&amp; &#65; &#x4a; &#X4F; &sup2; &lt; | a &amp; b | &amp;amp x | &amp;#65 y | &amp;#xZ; | &amp;;</p>'
    );
    assert.equal(fmt('<p>&#x41;&#xFF;&#12;&abc1;x&Z9;</p>'), '<p>&#x41;&#xFF;&#12;&abc1;x&Z9;</p>');
    assert.equal(fmt('<p>&#1x; &#x;</p>'), '<p>&amp;#1x; &amp;#x;</p>');
  });
});

describe('description sanitizer: attribute parsing', () => {
  const fmt = formatEventDescriptionHtml;
  const link = (href, text = 'x') => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  it('reads single-quoted, double-quoted and unquoted values', () => {
    assert.equal(fmt("<a href='http://a.com/x y'>x</a>"), link('http://a.com/x y'));
    assert.equal(fmt('<a href="http://a.com/x y">x</a>'), link('http://a.com/x y'));
    assert.equal(fmt('<a href=http://a.com/x>x</a>'), link('http://a.com/x'));
    assert.equal(fmt('<a href=http://a.com/x target=foo>x</a>'), link('http://a.com/x'));
    assert.equal(fmt('<a href = "http://a.com/x">x</a>'), link('http://a.com/x'));
  });
  it('a mixed quote does not close the value', () => {
    assert.equal(fmt('<a href="http://a.com/it\'s">x</a>'), link('http://a.com/it&#39;s'));
    assert.equal(fmt("<a href='http://a.com/\"q'>x</a>"), link('http://a.com/&quot;q'));
  });
  it('an attribute directly after a closing quote still parses', () => {
    assert.equal(fmt('<a title="x"href="http://a.com/">t</a>'), link('http://a.com/', 't'));
  });
  it('href need not be the first attribute and valueless attributes do not break parsing', () => {
    assert.equal(fmt('<a title="t" href="http://a.com/">x</a>'), link('http://a.com/'));
    assert.equal(fmt('<a download href="http://a.com/">x</a>'), link('http://a.com/'));
    assert.equal(fmt('<a href="http://a.com/" download>x</a>'), link('http://a.com/'));
    assert.equal(fmt('<a  HREF="http://a.com/"\n>x</a>'), link('http://a.com/'));
  });
  it('an anchor without a usable href keeps only target and rel', () => {
    const bare = '<a target="_blank" rel="noopener noreferrer">x</a>';
    assert.equal(fmt('<a>x</a>'), bare);
    assert.equal(fmt('<a href>x</a>'), bare);
    assert.equal(fmt('<a href="">x</a>'), bare);
  });
  it('slash separates attributes like whitespace', () => {
    assert.equal(fmt('<a/href="http://a.com/">x</a>'), link('http://a.com/'));
  });
});

describe('description sanitizer: href safety', () => {
  const fmt = formatEventDescriptionHtml;
  const link = (href) => `<a href="${href}" target="_blank" rel="noopener noreferrer">x</a>`;
  const bare = '<a target="_blank" rel="noopener noreferrer">x</a>';
  it('accepts http, https, mailto in any case; rejects other or embedded schemes', () => {
    assert.equal(fmt('<a href="http://a.com">x</a>'), link('http://a.com'));
    assert.equal(fmt('<a href="HTTPS://A.com">x</a>'), link('HTTPS://A.com'));
    assert.equal(fmt('<a href="mailto:a@b.c">x</a>'), link('mailto:a@b.c'));
    assert.equal(fmt('<a href="xhttp://a.com">x</a>'), bare);
    assert.equal(fmt('<a href="ftp://a.com">x</a>'), bare);
    assert.equal(fmt('<a href="//a.com">x</a>'), bare);
    assert.equal(fmt('<a href="a http://a.com">x</a>'), bare);
  });
  it('trims leading and trailing spaces and control characters', () => {
    assert.equal(fmt('<a href=" http://a.com">x</a>'), link('http://a.com'));
    assert.equal(fmt('<a href="http://a.com ">x</a>'), link('http://a.com'));
    assert.equal(fmt('<a href="\u0001 \u001f http://a.com/p \u0001">x</a>'), link('http://a.com/p'));
    assert.equal(fmt('<a href="   ">x</a>'), bare);
    assert.equal(fmt('<a href="http://a.com/\u00a0">x</a>'), link('http://a.com/\u00a0'));
  });
  it('removes embedded tabs and newlines', () => {
    assert.equal(fmt('<a href="ht\ttp://a.com/\nx\ry">x</a>'), link('http://a.com/xy'));
  });
  it('decodes numeric references, hex in either case, and semicolon-less ones', () => {
    assert.equal(fmt('<a href="&#104;ttp://a.com">x</a>'), link('http://a.com'));
    assert.equal(fmt('<a href="&#x68;ttp://a.com">x</a>'), link('http://a.com'));
    assert.equal(fmt('<a href="&#X68;ttp://a.com">x</a>'), link('http://a.com'));
    assert.equal(fmt('<a href="&#104ttp://a.com">x</a>'), link('http://a.com'));
    assert.equal(fmt('<a href="&#x68ttp://a.com">x</a>'), link('http://a.com'));
    assert.equal(fmt('<a href="jav&#x61;script:alert(1)">x</a>'), bare);
  });
  it('maps every named reference it knows and leaves unknown names alone', () => {
    assert.equal(
      fmt('<a href="http&colon;&sol;&sol;a.com/?x=&amp;y&AMP;z&lt;&LT;&gt;&GT;&quot;&QUOT;&apos;&nbsp;e">x</a>'),
      link('http://a.com/?x=&amp;y&amp;z&lt;&lt;&gt;&gt;&quot;&quot;&#39;\u00a0e')
    );
    assert.equal(fmt('<a href="http&Tab;s://a&NewLine;.com">x</a>'), link('https://a.com'));
    assert.equal(fmt('<a href="http://a.com/?&foo;&constructor;">x</a>'), link('http://a.com/?&amp;foo;&amp;constructor;'));
  });
  it('code points: zero and out-of-range become U+FFFD, the maximum is kept', () => {
    assert.equal(fmt('<a href="http://a.com/&#0;">x</a>'), link('http://a.com/\ufffd'));
    assert.equal(fmt('<a href="http://a.com/&#1114111;">x</a>'), link('http://a.com/' + String.fromCodePoint(0x10ffff)));
    assert.equal(fmt('<a href="http://a.com/&#1114112;">x</a>'), link('http://a.com/\ufffd'));
    assert.equal(fmt('<a href="http://a.com/&#x110000;">x</a>'), link('http://a.com/\ufffd'));
    assert.equal(fmt('<a href="http://a.com/&#x10FFFF;">x</a>'), link('http://a.com/' + String.fromCodePoint(0x10ffff)));
    assert.equal(fmt('<a href="http://a.com/&#1;z">x</a>'), link('http://a.com/\u0001z'));
  });
});

describe('extractMeetLink fields that are present but empty', () => {
  it('finds a meet link in location or description when title getters return empty', () => {
    assert.equal(extractMeetLink({ getTitle: () => '', getLocation: () => '', getDescription: () => 'join meet.google.com/abc-defg-hij now' }), 'https://meet.google.com/abc-defg-hij');
    assert.equal(extractMeetLink({ title: 'x', location: 'meet.google.com/aaa-bbbb-ccc' }), 'https://meet.google.com/aaa-bbbb-ccc');
    assert.equal(extractMeetLink({ title: 'x' }), null);
  });
});
