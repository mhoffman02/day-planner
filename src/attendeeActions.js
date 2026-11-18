/**
 * @file attendeeActions.js
 * @description Appointment row actions (user 2026-11-18): email the other attendees through Gmail compose with To and
 * Subject filled in (as Google Calendar does for Email guests). Chat has no such link (a group chat needs the Chat API
 * and a new OAuth scope), so the second row icon opens the appointment in Google Calendar, which offers Chat with guests.
 * Pure: no DOM, runs in node. URL literals are split so the copy inlined in gas-app/Script.html survives HtmlService.
 */

const GMAIL_COMPOSE_URL = 'https:' + '/' + '/mail.google.com/mail/?view=cm&fs=1';

/**
 * window.open features for the Google Calendar window: centered on the available screen, shrunk to fit a small one.
 * A window rather than a tab because the installed app has no tabs to switch between.
 * @param {{availWidth?:number, availHeight?:number}} [screen] window.screen.
 * @returns {string} Features string for window.open.
 */
export function calendarWindowFeatures(screen) {
  const availW = (screen && screen.availWidth) || 0;
  const availH = (screen && screen.availHeight) || 0;
  const width = availW ? Math.min(900, availW) : 900;
  const height = availH ? Math.min(760, availH) : 760;
  const left = Math.max(0, Math.round((availW - width) / 2));
  const top = Math.max(0, Math.round((availH - height) / 2));
  return `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
}

/**
 * Addresses of everyone invited except me. Rooms and resources are already dropped from the guest list server side.
 * @param {Array<{email?:string, self?:boolean}>} [guests] Guests of an appointment.
 * @returns {string[]} Unique addresses, in guest order.
 */
export function otherGuestEmails(guests) {
  const seen = new Set();
  const out = [];
  (guests || []).forEach((g) => {
    const email = g && !g.self ? String(g.email || '').trim() : '';
    const key = email.toLowerCase();
    if (!email || seen.has(key)) return;
    seen.add(key);
    out.push(email);
  });
  return out;
}

/**
 * Gmail compose link for the attendees, the meeting title as Subject.
 * @param {{title?:string, guests?:Array<object>}} evt Appointment.
 * @returns {string} Compose URL, or an empty string when nobody else is invited.
 */
export function emailAttendeesUrl(evt) {
  const to = otherGuestEmails(evt && evt.guests);
  if (!to.length) return '';
  return GMAIL_COMPOSE_URL + '&to=' + encodeURIComponent(to.join(',')).replace(/%2C/g, ',').replace(/%40/g, '@') + '&su=' + encodeURIComponent((evt && evt.title) || '');
}
