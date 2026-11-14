/**
 * @file Header date label split into weekday and date so each part can be styled.
 * Pure helper, hand-mirrored into gas-app/Script.html.
 */

/**
 * @param {string} dateStr Local date key, YYYY-MM-DD.
 * @returns {{weekday: string, date: string}} e.g. weekday Sat, date Nov 14, 2026
 */
export function splitDateDisplay(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  if (!m) return { weekday: '', date: dateStr || '' };
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  };
}
