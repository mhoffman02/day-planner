/**
 * @file calendarEngine.js
 * @description Day Planner Calendar & Schedule Engine.
 * Handles 07:00 AM - 07:00 PM schedule grid, event slot mapping, modal popups, and 7x5 monthly calendar calculations.
 */

import { getLocalDateStr } from './binderStore.js';

/**
 * Generates 25 time slot entries for 07:00 AM to 07:00 PM (30-min intervals).
 * @returns {Array<{timeKey: string, displayTime: string, isHalfHour: boolean, events: Array<object>}>} Array of schedule grid slot objects.
 */
export function generateScheduleGrid() {
  const slots = [];
  const startHour = 7;
  const endHour = 19; // 7:00 PM

  for (let hour = startHour; hour < endHour; hour++) {
    const formattedHourStr = hour > 12 ? `${hour - 12}` : `${hour}`;
    const ampm = hour >= 12 ? 'PM' : 'AM';

    // 00 slot
    slots.push({
      timeKey: `${hour.toString().padStart(2, '0')}:00`,
      displayTime: `${formattedHourStr}:00 ${ampm}`,
      isHalfHour: false,
      events: []
    });

    // 30 slot
    slots.push({
      timeKey: `${hour.toString().padStart(2, '0')}:30`,
      displayTime: `${formattedHourStr}:30 ${ampm}`,
      isHalfHour: true,
      events: []
    });
  }

  // Final 07:00 PM slot marker
  slots.push({
    timeKey: '19:00',
    displayTime: '7:00 PM',
    isHalfHour: false,
    events: []
  });

  return slots;
}

/**
 * Maps raw calendar events onto the schedule grid slots.
 * @param {Array<object>} [gridSlots=[]] Base schedule grid slots.
 * @param {Array<object>} [events=[]] List of raw calendar event objects.
 * @returns {Array<object>} Schedule grid slots with mapped events.
 */
export function mapEventsToGrid(gridSlots = [], events = []) {
  const grid = gridSlots.map(slot => ({ ...slot, events: [] }));

  events.forEach(evt => {
    const start = new Date(evt.startTime);
    const startHour = start.getHours();
    const startMin = start.getMinutes();
    const slotMin = startMin < 30 ? '00' : '30';
    const targetKey = `${startHour.toString().padStart(2, '0')}:${slotMin}`;

    const matchingSlot = grid.find(s => s.timeKey === targetKey);
    if (matchingSlot) {
      matchingSlot.events.push(formatEventModalPayload(evt));
    }
  });

  return grid;
}

/**
 * Extracts Google Meet conference or join link from an event object or its text fields.
 * @param {object} [rawEvent={}] Raw calendar event data object.
 * @returns {string|null} Google Meet URL or null.
 */
export function extractMeetLink(rawEvent = {}) {
  if (!rawEvent) return null;
  if (rawEvent.meetLink && typeof rawEvent.meetLink === 'string' && rawEvent.meetLink.trim()) {
    return rawEvent.meetLink.trim();
  }
  if (rawEvent.hangoutLink && typeof rawEvent.hangoutLink === 'string' && rawEvent.hangoutLink.trim()) {
    return rawEvent.hangoutLink.trim();
  }
  if (typeof rawEvent.getHangoutLink === 'function') {
    try {
      const hl = rawEvent.getHangoutLink();
      if (hl && typeof hl === 'string' && hl.trim()) return hl.trim();
    } catch (err) {
      // getHangoutLink may throw if unsupported on specific event type -- keep probing the other sources.
      console.error('extractMeetLink: getHangoutLink() threw, falling back to conferenceData/description', err.stack);
    }
  }
  if (rawEvent.conferenceData && Array.isArray(rawEvent.conferenceData.entryPoints)) {
    for (const ep of rawEvent.conferenceData.entryPoints) {
      if (ep && (ep.entryPointType === 'video' || (ep.uri && ep.uri.indexOf('meet.google.com') !== -1))) {
        if (ep.uri && typeof ep.uri === 'string' && ep.uri.trim()) return ep.uri.trim();
      }
    }
  }
  const title = (typeof rawEvent.getTitle === 'function' ? rawEvent.getTitle() : '') || rawEvent.title || rawEvent.summary || '';
  const loc = (typeof rawEvent.getLocation === 'function' ? rawEvent.getLocation() : '') || rawEvent.location || '';
  const desc = (typeof rawEvent.getDescription === 'function' ? rawEvent.getDescription() : '') || rawEvent.description || '';
  const text = `${title} ${loc} ${desc}`;
  const match = text.match(/(?:https?:\/\/)?meet\.google\.com\/[a-z0-9_-]+(?:\?[^\s"'<>]*)?/i);
  if (match) {
    let link = match[0];
    if (!/^https?:\/\//i.test(link)) {
      link = `https://${link}`;
    }
    return link;
  }
  return null;
}

/**
 * Formats event object for the interactive Google Meet & Google Calendar popup modal.
 * @param {object} [rawEvent={}] Raw calendar event data object.
 * @returns {{id: string, title: string, formattedTime: string, startTime: string|null, endTime: string|null, location: string, description: string, meetLink: string|null, gCalLink: string, attendees: Array<string>}} Formatted event modal payload.
 */
export function formatEventModalPayload(rawEvent = {}) {
  const startTime = rawEvent.startTime ? new Date(rawEvent.startTime) : null;
  const endTime = rawEvent.endTime ? new Date(rawEvent.endTime) : null;

  const timeString = startTime && endTime
    ? `${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'All Day';

  const dateStr = (rawEvent.startTime ? rawEvent.startTime.slice(0, 10) : '') || getLocalDateStr();
  const gCalLink = rawEvent.htmlLink || rawEvent.gCalLink || `https://calendar.google.com/calendar/r/day/${dateStr.replace(/-/g, '/')}`;

  return {
    id: rawEvent.id || `evt_${Math.random().toString(36).slice(2, 8)}`,
    title: rawEvent.title || 'Untitled Event',
    formattedTime: timeString,
    startTime: rawEvent.startTime,
    endTime: rawEvent.endTime,
    location: rawEvent.location || '',
    description: rawEvent.description || '',
    meetLink: extractMeetLink(rawEvent),
    gCalLink,
    attendees: rawEvent.attendees || []
  };
}

/*
 * Event description sanitizer. Calendar descriptions are attacker-controlled (anyone can send an
 * invite) and render through x-html, which Alpine also initializes, so any attribute is as
 * dangerous as a script. This is an allowlist that rebuilds the markup from a small HTML
 * tokenizer: only a, br, p, b, i, u, ul, ol, li and span survive, with no attributes except a
 * vetted http, https or mailto href on a (plus a forced target=_blank, rel=noopener noreferrer).
 * Other tags are dropped and keep their text; script-like elements lose their content too. All
 * text is re-escaped, so nothing the input spells can become markup. Pure string code so node
 * tests run it (no DOM shim); mirrored verbatim in gas-app/Script.html (tools/check-mirror.js).
 */

function descAllowedTag(name) {
  return /^(?:a|br|p|b|i|u|ul|ol|li|span)$/.test(name);
}

function descDropsContent(name) {
  return /^(?:script|style|iframe|frame|frameset|noembed|noframes|noscript|textarea|title|xmp|template|object|embed|applet|svg|math|plaintext|select)$/.test(name);
}

function descScan(html, from, re) {
  let k = from;
  while (k < html.length && !re.test(html[k])) k++;
  return k;
}

function descEscapeText(s) {
  return s.replace(/&(?!(?:#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);)/g, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function descEscapeAll(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\u0027/g, '&#39;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* Decodes character references so an encoded scheme (jav&#x61;script:) is checked as the browser reads it. */
function descDecodeEntities(s) {
  const named = { amp: '&', AMP: '&', lt: '<', LT: '<', gt: '>', GT: '>', quot: '"', QUOT: '"', apos: '\u0027', colon: ':', Tab: '\t', NewLine: '\n', sol: '/', nbsp: '\u00a0' };
  return s.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);?/g, (m, ent) => {
    if (ent[0] !== '#') return Object.prototype.hasOwnProperty.call(named, ent) ? named[ent] : m;
    const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\ufffd';
  });
}

/*
 * The href exactly as the browser will read it back from the re-escaped attribute: entities
 * decoded, leading and trailing C0 controls and spaces trimmed, tab and newlines removed (the URL
 * parser does both). Only http, https and mailto pass; anything else (relative too) yields empty.
 */
function descSafeHref(raw) {
  const decoded = descDecodeEntities(raw);
  let a = 0;
  let b = decoded.length;
  while (a < b && decoded.charCodeAt(a) <= 32) a++;
  while (b > a && decoded.charCodeAt(b - 1) <= 32) b--;
  const url = decoded.slice(a, b).replace(/[\t\n\r]/g, '');
  return /^(?:https?|mailto):/i.test(url) ? url : '';
}

function descReadValue(html, from) {
  const k = descScan(html, from, /[^\t\n\f\r ]/);
  const q = html[k];
  if (q === '"' || q === '\u0027') {
    const close = html.indexOf(q, k + 1);
    return close === -1 ? null : { text: html.slice(k + 1, close), end: close + 1 };
  }
  const end = descScan(html, k, /[\t\n\f\r >]/);
  return { text: html.slice(k, end), end: end };
}

/* Attributes up to the closing angle bracket, tokenized like HTML (a slash separates, quotes may hold one); null at end of input. */
function descReadAttrs(html, from) {
  const attrs = [];
  let j = from;
  while (j < html.length) {
    if (html[j] === '>') return { attrs: attrs, end: j + 1 };
    if (/[\t\n\f\r /]/.test(html[j])) {
      j++;
      continue;
    }
    const nameEnd = descScan(html, j + 1, /[\t\n\f\r />=]/);
    const k = descScan(html, nameEnd, /[^\t\n\f\r ]/);
    const value = html[k] === '=' ? descReadValue(html, k + 1) : { text: '', end: nameEnd };
    if (!value) return null;
    attrs.push([html.slice(j, nameEnd).toLowerCase(), value.text]);
    j = value.end;
  }
  return null;
}

/* One markup token at lt: a comment or declaration to skip, an open or close tag, or null for a literal angle bracket. */
function descReadTag(html, lt) {
  const next = html.charAt(lt + 1);
  if (html.startsWith('!-' + '-', lt + 1)) {
    const close = html.indexOf('-' + '->', lt + 4);
    return { kind: 'skip', end: close === -1 ? html.length : close + 3 };
  }
  if (next === '!' || next === '?' || (next === '/' && !/[a-zA-Z]/.test(html.charAt(lt + 2)))) {
    const gt = html.indexOf('>', lt + 1);
    return { kind: 'skip', end: gt === -1 ? html.length : gt + 1 };
  }
  const nameStart = next === '/' ? lt + 2 : lt + 1;
  if (!/[a-zA-Z]/.test(html.charAt(nameStart))) return null;
  const nameEnd = descScan(html, nameStart + 1, /[\t\n\f\r />]/);
  const parsed = descReadAttrs(html, nameEnd);
  if (!parsed) return { kind: 'skip', end: html.length };
  const name = html.slice(nameStart, nameEnd).toLowerCase();
  return { kind: next === '/' ? 'close' : 'open', name: name, attrs: parsed.attrs, end: parsed.end };
}

function descOpenTag(tag) {
  if (tag.name !== 'a') return '<' + tag.name + '>';
  const hrefAttr = tag.attrs.find((at) => at[0] === 'href');
  const href = hrefAttr ? descSafeHref(hrefAttr[1]) : '';
  return '<a' + (href ? ' href="' + descEscapeAll(href) + '"' : '') + ' target="_blank" rel="noopener noreferrer">';
}

/* Next index after the end tag of a content-dropping element (or end of input when unclosed). */
function descSkipContent(html, tag) {
  const close = html.toLowerCase().indexOf('<' + '/' + tag.name, tag.end);
  if (close === -1) return html.length;
  const gt = html.indexOf('>', close);
  return gt === -1 ? html.length : gt + 1;
}

/* Emits an allowed tag (closers only for open elements, so output stays balanced); returns the next index. */
function descApplyTag(html, tag, out, open) {
  if (tag.kind === 'skip') return tag.end;
  if (tag.kind === 'close') {
    const at = open.lastIndexOf(tag.name);
    while (at !== -1 && open.length > at) out.push('<' + '/' + open.pop() + '>');
    return tag.end;
  }
  if (descDropsContent(tag.name)) return descSkipContent(html, tag);
  if (!descAllowedTag(tag.name)) return tag.end;
  out.push(descOpenTag(tag));
  if (tag.name !== 'br') open.push(tag.name);
  return tag.end;
}

function sanitizeDescriptionHtml(html) {
  const out = [];
  const open = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      out.push(descEscapeText(html.slice(i)));
      break;
    }
    out.push(descEscapeText(html.slice(i, lt)));
    const tag = descReadTag(html, lt);
    if (tag) {
      i = descApplyTag(html, tag, out, open);
    } else {
      out.push('&lt;');
      i = lt + 1;
    }
  }
  while (open.length) out.push('<' + '/' + open.pop() + '>');
  return out.join('');
}

/**
 * Formats a calendar event description for display. Descriptions containing HTML markup (an
 * invite created by another Calendar client with anchor or line-break formatting) go through the
 * allowlist sanitizer above; plain-text descriptions are escaped and wrapped in pre so manual line
 * breaks survive instead of collapsing under normal HTML whitespace rules.
 * @param {string} [description] Raw event description text (default empty).
 * @returns {string} Safe HTML fragment ready to bind via x-html; empty if there is no description.
 */
export function formatEventDescriptionHtml(description = '') {
  if (!description) return '';
  if (/<[a-z][\s\S]*?>/i.test(description)) return sanitizeDescriptionHtml(description);
  return '<pre>' + descEscapeAll(description) + '</pre>';
}

/**
 * Generates monthly calendar grid matrix for a given year & month (1-indexed month).
 * @param {number} year Four-digit year (e.g. 2026).
 * @param {number} month Month number (1-12).
 * @param {Array<object>} [events=[]] List of calendar event objects.
 * @returns {Array<{dateStr: string, dayNumber: number, isCurrentMonth: boolean, events: Array<object>}>} Monthly calendar grid day cells.
 */
export function generateMonthlyCalendarGrid(year, month, events = []) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const totalDays = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay(); // 0 = Sun, 1 = Mon...

  const days = [];

  // Padding days from previous month
  const prevMonthLastDay = new Date(year, month - 1, 0).getDate();
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    days.push({
      dateStr: '',
      dayNumber: prevMonthLastDay - i,
      isCurrentMonth: false,
      events: []
    });
  }

  // Days of current month
  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    const dayEvents = events.filter(e => {
      const eDate = e.startTime ? getLocalDateStr(new Date(e.startTime)) : '';
      return eDate === dateStr;
    });

    days.push({
      dateStr,
      dayNumber: day,
      isCurrentMonth: true,
      events: dayEvents
    });
  }

  // Trailing padding days to fill 35 or 42 grid cells
  const remainingCells = (7 - (days.length % 7)) % 7;
  for (let i = 1; i <= remainingCells; i++) {
    days.push({
      dateStr: '',
      dayNumber: i,
      isCurrentMonth: false,
      events: []
    });
  }

  return days;
}
