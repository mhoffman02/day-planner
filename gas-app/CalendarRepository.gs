/**
 * @file CalendarRepository.gs
 * @description Calendar reads for the Gmail/Meeting hub (Phase 28) via the Advanced Calendar service
 * (needed for recurringEventId, attachments, conferenceData and extendedProperties). Read-only:
 * never writes Calendar. Events are normalized, classified with DPEngines.classifyEventDetailed,
 * and Task-derived events (gasTaskId) are never offered as meeting destinations nor importable.
 * Series discovery persists RecurringEventId into the registry via DPConfig so title matching is
 * only a fallback (spec section 5).
 *
 * IIFE per .agents/rules/gas-namespace-iife.md; only export is DPCalendarRepo. Literal-only top
 * level per .agents/rules/gas-global-init-order.md; DPEngines/DPConfig are read lazily.
 */
(function(global) {

var CAL_FIELDS_ = 'items(id,summary,status,start,end,eventType,transparency,recurringEventId,htmlLink,hangoutLink,' +
  'attendees(email),conferenceData(entryPoints),attachments(fileUrl,fileId,title,mimeType),' +
  'extendedProperties(shared)),nextPageToken';
var CAL_PAGE_SIZE_ = 250;
var CAL_MAX_PAGES_ = 8;
var CAL_DAY_MS_ = 24 * 60 * 60 * 1000;

/**
 * @throws {Error} When the Advanced Calendar service is not enabled.
 */
function requireCalendar_() {
  if (typeof Calendar === 'undefined' || !Calendar.Events) {
    var err = new Error('Advanced Calendar service is not enabled for this project');
    err.code = 'CALENDAR_SERVICE_MISSING';
    throw err;
  }
}

/**
 * Normalizes a raw Calendar v3 event (never keeps description or attendee emails).
 * @param {object} raw Calendar.Events resource.
 * @param {string} calendarId Source calendar.
 * @returns {object} Normalized event.
 */
function normalizeEvent_(raw, calendarId) {
  var start = raw.start || {};
  return {
    id: raw.id,
    calendarId: calendarId,
    recurringEventId: raw.recurringEventId || null,
    summary: raw.summary || '',
    status: raw.status || 'confirmed',
    start: start.dateTime || start.date || null,
    end: (raw.end && (raw.end.dateTime || raw.end.date)) || null,
    allDay: !!(start.date && !start.dateTime),
    eventType: raw.eventType || 'default',
    transparency: raw.transparency || 'opaque',
    htmlLink: raw.htmlLink || null,
    hangoutLink: raw.hangoutLink || null,
    conferenceData: raw.conferenceData ? true : false,
    attendees: (raw.attendees || []).map(function() { return 1; }),
    attachments: (raw.attachments || []).map(function(a) {
      return { fileUrl: a.fileUrl || null, fileId: a.fileId || null, title: a.title || '', mimeType: a.mimeType || '' };
    }),
    extendedProperties: raw.extendedProperties || null
  };
}

/**
 * Loads normalized, classified events in a window (paged, bounded).
 * @param {string} calendarId Calendar id or primary.
 * @param {Date} timeMin Window start.
 * @param {Date} timeMax Window end.
 * @param {Array<object>} registry Parsed registry rows (for classification).
 * @returns {Array<object>} Events with type, importable and typeReason added.
 */
function loadEvents(calendarId, timeMin, timeMax, registry) {
  requireCalendar_();
  var cal = calendarId || 'primary';
  var out = [];
  var pageToken = null;
  var pages = 0;
  do {
    var params = {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: CAL_PAGE_SIZE_,
      conferenceDataVersion: 1,
      fields: CAL_FIELDS_
    };
    if (pageToken) params.pageToken = pageToken;
    var resp = Calendar.Events.list(cal, params) || {};
    (resp.items || []).forEach(function(raw) {
      var evt = normalizeEvent_(raw, cal);
      var c = DPEngines.classifyEventDetailed(evt, registry);
      evt.type = c.type;
      evt.importable = c.importable;
      evt.typeReason = c.reason;
      out.push(evt);
    });
    pageToken = resp.nextPageToken || null;
    pages += 1;
  } while (pageToken && pages < CAL_MAX_PAGES_);
  if (pageToken) {
    var tooMany = new Error('Calendar window has more events than the bounded page limit');
    tooMany.code = 'CALENDAR_WINDOW_TOO_LARGE';
    throw tooMany;
  }
  return out;
}

/**
 * Task-derived events can never be a destination.
 * @param {object} evt Normalized event.
 * @returns {boolean} True when this event is a legitimate meeting destination.
 */
function isDestination_(evt) {
  var shared = evt.extendedProperties && evt.extendedProperties.shared;
  if (shared && shared.gasTaskId) return false;
  if (evt.status === 'cancelled') return false;
  return DPEngines.isMeetingDestination(evt.type);
}

/**
 * @param {string} text Title text.
 * @returns {string} Normalized title minus a trailing generic "meeting" word.
 */
function prepKey_(text) {
  return DPEngines.normalizeEventTitle(text).replace(/ meeting$/, '');
}

/**
 * Builds selectOccurrence-ready occurrences for a series from classified events, linking a PREP block
 * on the same local day whose title contains the series title key.
 * @param {object} seriesRow Registry row.
 * @param {Array<object>} events Classified events for the window.
 * @returns {Array<{id:string,start:string,end:string,status:string,prepStart?:string,summary:string,htmlLink:(string|null)}>} Occurrences.
 */
function occurrencesForSeries(seriesRow, events) {
  var resolved = DPEngines.resolveSeries([seriesRow], events);
  if (!resolved.length || !resolved[0].events.length) return [];
  var key = prepKey_(seriesRow.TitleFallback || seriesRow.DisplayName);
  var preps = events.filter(function(e) {
    return e.type === DPEngines.EVENT_TYPE.PREP && key !== '' && DPEngines.normalizeEventTitle(e.summary).indexOf(key) !== -1;
  });
  return resolved[0].events.filter(isDestination_).map(function(e) {
    var meetingMs = Date.parse(e.start);
    var occ = { id: e.id, start: e.start, end: e.end || e.start, status: e.status, summary: e.summary, htmlLink: e.htmlLink };
    var prep = preps.filter(function(p) {
      var ps = Date.parse(p.start);
      return ps <= meetingMs && meetingMs - ps < CAL_DAY_MS_;
    }).sort(function(a, b) { return Date.parse(b.start) - Date.parse(a.start); })[0];
    if (prep) occ.prepStart = prep.start;
    return occ;
  });
}

/**
 * Upcoming occurrences of one registry series.
 * @param {object} seriesRow Registry row.
 * @param {Array<object>} registry All parsed registry rows (classification context).
 * @param {Date} now Current instant.
 * @param {number} [horizonDays] Look-ahead window (default 21).
 * @returns {Array<object>} Occurrences (see occurrencesForSeries).
 */
function listOccurrences(seriesRow, registry, now, horizonDays) {
  var days = horizonDays || 21;
  var events = loadEvents(seriesRow.CalendarId || 'primary', new Date(now.getTime() - CAL_DAY_MS_), new Date(now.getTime() + days * CAL_DAY_MS_), registry);
  return occurrencesForSeries(seriesRow, events);
}

/**
 * Verifies an occurrence still exists and is a legitimate meeting destination.
 * @param {object} seriesRow Registry row.
 * @param {string} occurrenceId Calendar event id.
 * @param {Array<object>} registry Parsed registry rows.
 * @returns {object} Normalized, classified event.
 * @throws {Error} OCCURRENCE_NOT_FOUND / OCCURRENCE_NOT_DESTINATION (retryable false).
 */
function getOccurrence(seriesRow, occurrenceId, registry) {
  requireCalendar_();
  var raw;
  try {
    raw = Calendar.Events.get(seriesRow.CalendarId || 'primary', occurrenceId, { fields: 'id,summary,status,start,end,eventType,transparency,recurringEventId,htmlLink,hangoutLink,extendedProperties(shared)' });
  } catch (err) {
    var nf = new Error('Calendar occurrence not found');
    nf.code = 'OCCURRENCE_NOT_FOUND';
    nf.retryable = false;
    nf.cause = err;
    throw nf;
  }
  var evt = normalizeEvent_(raw, seriesRow.CalendarId || 'primary');
  var c = DPEngines.classifyEventDetailed(evt, registry);
  evt.type = c.type;
  evt.importable = c.importable;
  if (!isDestination_(evt)) {
    var bad = new Error('Calendar event is not a meeting destination');
    bad.code = 'OCCURRENCE_NOT_DESTINATION';
    bad.retryable = false;
    throw bad;
  }
  return evt;
}

/**
 * Finds recurring event ids for registry series (read-only) and persists newly discovered ids
 * into the registry through DPConfig when a writer exists and persist is true.
 * @param {Array<object>} registry Parsed registry rows.
 * @param {Date} now Current instant.
 * @param {{persist:boolean}} opts persist false means report only (DRY_RUN).
 * @returns {{discovered:Array<{seriesKey:string,recurringEventId:string,matchedBy:string,renamed:boolean}>,
 *   stale:string[], persisted:boolean, persistGap:(string|null)}} Discovery report.
 */
function discoverSeries(registry, now, opts) {
  var byCalendar = {};
  registry.filter(function(r) { return r.Enabled !== false; }).forEach(function(r) {
    var cal = r.CalendarId || 'primary';
    if (!byCalendar[cal]) byCalendar[cal] = [];
    byCalendar[cal].push(r);
  });
  var discovered = [];
  var stale = [];
  Object.keys(byCalendar).forEach(function(cal) {
    var events = loadEvents(cal, new Date(now.getTime() - 14 * CAL_DAY_MS_), new Date(now.getTime() + 60 * CAL_DAY_MS_), registry);
    DPEngines.resolveSeries(byCalendar[cal], events).forEach(function(s) {
      if (s.staleRecurringEventId) stale.push(s.seriesKey);
      if (s.discovery && s.discoveredRecurringEventId) {
        discovered.push({ seriesKey: s.seriesKey, recurringEventId: s.discoveredRecurringEventId, matchedBy: s.matchedBy, renamed: s.renamed });
      }
    });
  });
  var persisted = false;
  var persistGap = null;
  if (opts && opts.persist && discovered.length) {
    if (typeof DPConfig !== 'undefined' && DPConfig && typeof DPConfig.updateRegistryRow === 'function') {
      discovered.forEach(function(d) { DPConfig.updateRegistryRow(d.seriesKey, { RecurringEventId: d.recurringEventId }); });
      persisted = true;
    } else {
      persistGap = 'DPConfig.updateRegistryRow(seriesKey, fields) is not available; RecurringEventId not saved';
    }
  }
  return { discovered: discovered, stale: stale, persisted: persisted, persistGap: persistGap };
}

global.DPCalendarRepo = Object.freeze({
  loadEvents: loadEvents,
  occurrencesForSeries: occurrencesForSeries,
  listOccurrences: listOccurrences,
  getOccurrence: getOccurrence,
  discoverSeries: discoverSeries
});   // cross-file only: QueueProcessor.gs, HubController.gs, UnitTests.gs

})(typeof globalThis !== 'undefined' ? globalThis : this);
