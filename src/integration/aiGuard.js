/**
 * @file aiGuard.js
 * @description Fail-closed guard deciding whether any AI integration may touch an item, plus the
 * provider-neutral LanguageAssistant interface (spec section 14). No provider is wired in; the base
 * class throws 'Not configured'. Pure; no Google services, no logging of content.
 */

import { AI_EXCLUDED_LABELS } from './contracts.js';

// Extra conservative signals beyond AI_EXCLUDED_LABELS: audit and COR/procurement content.
const AIGUARD_SENSITIVE_RE = /audit|procure|acquisition|(?:^|[^a-z])cor(?:[^a-z]|$)|foia/i;
const AIGUARD_SENSITIVE_SIGNALS = new Set(['AUDIT', 'COR_PROCUREMENT', 'PROCUREMENT', 'FOIA', 'HR']);

function aiguardLabelExcluded(label) {
  const l = String(label).toLowerCase();
  const listed = AI_EXCLUDED_LABELS.some((x) => {
    const e = x.toLowerCase();
    return e.endsWith('/') ? l.startsWith(e) : l === e || l.startsWith(e + '/');
  });
  return listed || AIGUARD_SENSITIVE_RE.test(l);
}

/**
 * @param {{labels:string[], seriesAiAllowed:(boolean|string), featureFlag:boolean, userSelected?:boolean, signals?:string[]}} options
 * @returns {boolean} true only when every gate passes
 */
export function isAiAllowed(options) {
  if (!options || typeof options !== 'object') throw new Error('isAiAllowed: options object required');
  if (!Array.isArray(options.labels)) throw new Error('isAiAllowed: labels must be an array');
  if (options.labels.some(aiguardLabelExcluded)) return false;
  if ((options.signals || []).some((s) => AIGUARD_SENSITIVE_SIGNALS.has(String(s).toUpperCase()))) return false;
  if (options.featureFlag !== true) return false;
  const series = typeof options.seriesAiAllowed === 'string' ? options.seriesAiAllowed.trim().toLowerCase() : options.seriesAiAllowed;
  if (series === true || series === 'true') return true;
  if (series === 'conditional') return options.userSelected === true;
  return false;
}

/** Provider-neutral interface for a future approved language model. Unconfigured in v1. */
export class LanguageAssistant {
  draftMeetingFramingLine() {
    throw new Error('Not configured');
  }

  extractCandidateActions() {
    throw new Error('Not configured');
  }
}
