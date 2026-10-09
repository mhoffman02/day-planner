/**
 * @file externalTickets.js
 * @description Extracts a stable external-ticket key (Jira, ServiceNow, Apps Script failure) from an
 * email so multiple notifications about one ticket dedupe to one key. The key type comes from the
 * ticket ID pattern, not the sender. Pure; message bodies are read in memory only and never logged.
 */

const TICKETS_JIRA_RE = /\b([A-Z][A-Z0-9]{1,9}-\d{1,7})\b/g;
const TICKETS_SNOW_RE = /\b((?:INC|REQ|RITM|CHG|PRB|TASK|SCTASK)\d{7,})\b/;
const TICKETS_SCRIPT_RE = /summary of failures for google apps script:\s*(.+)/i;
// Common non-ticket tokens shaped like PROJECT-123.
const TICKETS_JIRA_DENY = new Set(['UTF', 'ISO', 'COVID', 'SHA', 'RFC', 'CVE', 'HTTP', 'NIST', 'FIPS', 'WCAG', 'GPT', 'MD', 'SSL', 'TLS']);

function ticketsJira(text) {
  for (const m of text.matchAll(TICKETS_JIRA_RE)) {
    const prefix = m[1].slice(0, m[1].indexOf('-'));
    if (!TICKETS_JIRA_DENY.has(prefix)) return m[1];
  }
  return null;
}

function ticketsFromText(text) {
  const snow = text.match(TICKETS_SNOW_RE);
  const jira = ticketsJira(text);
  // When one text names both, the ServiceNow ID wins only if it appears first.
  if (snow && jira) return text.indexOf(snow[1]) <= text.indexOf(jira) ? `SERVICENOW|${snow[1]}` : `JIRA|${jira}`;
  if (snow) return `SERVICENOW|${snow[1]}`;
  if (jira) return `JIRA|${jira}`;
  return null;
}

/**
 * @param {string} subject
 * @param {string} from
 * @param {string|null} [bodyText]
 * @returns {string|null} 'JIRA|ABC-123' | 'SERVICENOW|INC0012345' | 'SCRIPT_FAILURE|<slug>' | null
 */
export function extractExternalTicketKey(subject, from, bodyText) {
  if (typeof subject !== 'string') throw new Error('extractExternalTicketKey: subject must be a string');
  if (typeof from !== 'string') throw new Error('extractExternalTicketKey: from must be a string');
  const script = subject.match(TICKETS_SCRIPT_RE);
  if (script) {
    const slug = script[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (slug) return `SCRIPT_FAILURE|${slug}`;
  }
  const fromSubject = ticketsFromText(subject);
  if (fromSubject) return fromSubject;
  return typeof bodyText === 'string' ? ticketsFromText(bodyText) : null;
}
