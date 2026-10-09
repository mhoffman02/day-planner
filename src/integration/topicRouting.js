/**
 * @file topicRouting.js
 * @description Label-to-meeting-series destination suggestions (spec section 12). Suggestions only:
 * confirmation is required unless the user applied an explicit workflow Meeting label.
 * Pure function; no Google services.
 */

import { WORKFLOW_LABEL } from './contracts.js';

const TOPICROUTING_EXPLICIT = Object.freeze({
  [WORKFLOW_LABEL.MEETING_NCMMS_CORE]: 'NCMMS_CORE',
  [WORKFLOW_LABEL.MEETING_NCMMS_DAILY]: 'NCMMS_DAILY'
});

function topicroutingHas(set, name) {
  return set.has(name.toLowerCase());
}

/**
 * @param {string[]} labels Gmail label names on the thread
 * @returns {{suggestions:Array<{seriesKey:string,reason:string}>, requireConfirmation:boolean, explicit:boolean, humanReviewOnly:boolean}}
 */
export function suggestDestinations(labels) {
  if (!Array.isArray(labels)) throw new Error('suggestDestinations: labels must be an array');
  const set = new Set(labels.map((l) => String(l).toLowerCase()));
  const humanReviewOnly = topicroutingHas(set, '_NCMMS/OIG Audit');

  const explicit = [];
  for (const label of labels) {
    const key = TOPICROUTING_EXPLICIT[label];
    // Unknown Meeting/* labels are recognized but inert in v1.
    if (key) explicit.push({ seriesKey: key, reason: `Explicit label ${label}` });
  }

  const found = [];
  if (explicit.length === 0 && !humanReviewOnly) {
    const push = (seriesKey, reason) => found.push({ seriesKey, reason });
    const ncmms = [...set].some((l) => l === '_ncmms' || l.startsWith('_ncmms/'));
    if (topicroutingHas(set, '_NCMMS/Acquisition')) push('NCMMS_ACQ', 'Label _NCMMS/Acquisition');
    if (topicroutingHas(set, '_NCMMS/COR-TRM')) {
      push('TRM_PM', 'Label _NCMMS/COR-TRM');
      push('NCMMS_CORE', 'Label _NCMMS/COR-TRM (fallback)');
    }
    if (topicroutingHas(set, '_NCMMS/Approval-Request')) push('NCMMS_CORE', 'Label _NCMMS/Approval-Request (or make a task)');
    if (topicroutingHas(set, '_NCMMS/ncmms-support')) push('NCMMS_DAILY', 'Label _NCMMS/ncmms-support (unresolved exceptions)');
    if (topicroutingHas(set, 'P&S Tech & Innovation')) push('FACILITY_TECH', 'Label P&S Tech & Innovation');
    if (topicroutingHas(set, 'Elevator')) push('ELEVATOR_DATA', 'Label Elevator (exceptions only)');
    if (topicroutingHas(set, 'Jira') && ncmms) push('NCMMS_DAILY', 'Jira with NCMMS context');
    if (topicroutingHas(set, '_NCMMS')) {
      if (topicroutingHas(set, 'VIP') || topicroutingHas(set, '00_AR')) push('NCMMS_CORE', 'Label _NCMMS with VIP/action candidate');
      else push('NCMMS_DAILY', 'Label _NCMMS (general operational issue)');
    }
  }

  const seen = new Set();
  const suggestions = [...explicit, ...found].filter((s) => (seen.has(s.seriesKey) ? false : seen.add(s.seriesKey)));
  const isExplicit = explicit.length > 0;
  return {
    suggestions,
    requireConfirmation: !isExplicit,
    explicit: isExplicit,
    humanReviewOnly
  };
}
