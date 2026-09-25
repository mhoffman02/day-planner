/**
 * @file calendarEngine.js
 * @description Franklin Planner Calendar & Schedule Engine.
 * Handles 07:00 AM - 07:00 PM schedule grid, event slot mapping, modal popups, and 7x5 monthly calendar calculations.
 */

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
  if (rawEvent.conferenceData && Array.isArray(rawEvent.conferenceData.entryPoints)) {
    for (const ep of rawEvent.conferenceData.entryPoints) {
      if (ep && (ep.entryPointType === 'video' || (ep.uri && ep.uri.indexOf('meet.google.com') !== -1))) {
        return ep.uri;
      }
    }
  }
  const text = `${rawEvent.location || ''} ${rawEvent.description || ''}`;
  const match = text.match(/https?:\/\/meet\.google\.com\/[a-z0-9-]+/i);
  return match ? match[0] : null;
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

  const dateStr = (rawEvent.startTime ? rawEvent.startTime.slice(0, 10) : '') || new Date().toISOString().slice(0, 10);
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

const HTML_TAG_PATTERN = /<[a-z][\s\S]*?>/i;

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeDescriptionHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*(?:javascript|data):[^"']*\2/gi, '$1="#"')
    .replace(/<a(?![^>]*\btarget=)([^>]*?)>/gi, '<a target="_blank" rel="noopener noreferrer"$1>');
}

/**
 * Formats a calendar event description for display. Descriptions containing HTML markup (e.g.
 * an invite created by another Calendar client with <a>/<br> formatting) are sanitized and
 * returned as HTML; plain-text descriptions are escaped and wrapped in <pre> so manual line
 * breaks survive instead of collapsing under normal HTML whitespace rules.
 * @param {string} [description=''] Raw event description text.
 * @returns {string} Safe HTML fragment ready to bind via x-html; '' if there's no description.
 */
export function formatEventDescriptionHtml(description = '') {
  if (!description) return '';
  if (HTML_TAG_PATTERN.test(description)) {
    return sanitizeDescriptionHtml(description);
  }
  return `<pre>${escapeHtml(description)}</pre>`;
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
      const eDate = e.startTime ? new Date(e.startTime).toISOString().slice(0, 10) : '';
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
