/**
 * @file externalTickets.test.js
 * @description Unit tests for Jira/ServiceNow/Apps Script failure ticket key extraction.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractExternalTicketKey } from '../src/integration/externalTickets.js';

describe('extractExternalTicketKey', () => {
  it('Jira key from subject', () => {
    assert.equal(extractExternalTicketKey('[JIRA] (NCMMS-123) Fix thing', 'jira@x.atlassian.net', ''), 'JIRA|NCMMS-123');
  });
  it('ServiceNow key from subject', () => {
    assert.equal(extractExternalTicketKey('Incident INC0012345 has been updated', 'itsm@service-now.com', ''), 'SERVICENOW|INC0012345');
  });
  it('same ticket via different senders/formats yields same key', () => {
    const a = extractExternalTicketKey('[JIRA] (NCMMS-123) created', 'jira@x.net', 'body');
    const b = extractExternalTicketKey('Re: NCMMS-123 comment added', 'someone@gov', 'body');
    const c = extractExternalTicketKey('Update', 'jira@x.net', 'See ticket NCMMS-123 for details');
    assert.equal(a, b);
    assert.equal(a, c);
    const s1 = extractExternalTicketKey('INC0012345 opened', 'a@b', '');
    const s2 = extractExternalTicketKey('Re: INC0012345', 'c@d', '');
    assert.equal(s1, s2);
  });
  it('different tickets differ', () => {
    assert.notEqual(extractExternalTicketKey('NCMMS-123 x', 'a@b', ''), extractExternalTicketKey('NCMMS-124 x', 'a@b', ''));
    assert.notEqual(extractExternalTicketKey('INC0012345', 'a@b', ''), extractExternalTicketKey('INC0012346', 'a@b', ''));
  });
  it('ServiceNow message referencing a Jira key resolves by subject first', () => {
    assert.equal(extractExternalTicketKey('INC0012345 linked to NCMMS-9', 'a@b', ''), 'SERVICENOW|INC0012345');
  });
  it('Apps Script failure summary', () => {
    const subj = 'Summary of failures for Google Apps Script: Day Planner Sync';
    const k = extractExternalTicketKey(subj, 'apps-scripts-notifications@google.com', '');
    assert.equal(k, 'SCRIPT_FAILURE|day-planner-sync');
    assert.equal(k, extractExternalTicketKey(subj, 'apps-scripts-notifications@google.com', 'other'));
  });
  it('ignores non-ticket tokens', () => {
    assert.equal(extractExternalTicketKey('Using UTF-8 and ISO-27001', 'a@b', 'COVID-19'), null);
    assert.equal(extractExternalTicketKey('Lunch', 'a@b', null), null);
  });
  it('fails loud on non-string subject/from', () => {
    assert.throws(() => extractExternalTicketKey(null, 'a', ''), /subject/);
    assert.throws(() => extractExternalTicketKey('s', undefined, ''), /from/);
  });
});
