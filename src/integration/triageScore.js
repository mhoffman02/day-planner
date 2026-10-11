/**
 * @file triageScore.js
 * @description Deterministic, configurable Gmail thread triage scoring (spec section 11) and queue
 * assignment. Pure functions: no Google services, no clock. Message bodies are read in memory only
 * and are never logged or returned. The score NEVER produces an auto-create action; it only ranks
 * threads for human review.
 */

import { LEDGER_STATUS } from './contracts.js';

export const TRIAGE_BAND = Object.freeze({
  HIGH_CONFIDENCE: 'HIGH_CONFIDENCE',
  HUMAN_REVIEW: 'HUMAN_REVIEW',
  LIKELY_FYI: 'LIKELY_FYI',
  NOISE: 'NOISE'
});

export const TRIAGE_QUEUE = Object.freeze({
  DIRECT_ACTION: 'Direct Action',
  MEETING_CARRY_INS: 'Meeting Carry-ins',
  SYSTEM_EXCEPTIONS: 'System Exceptions',
  FYI_READING: 'FYI/Reading'
});

export const TRIAGE_DEFAULT_WEIGHTS = Object.freeze({
  DIRECT_TO: 3,
  LATEST_FROM_OTHER: 2,
  EXPLICIT_REQUEST: 3,
  DEADLINE_NEAR_REQUEST: 2,
  VIP: 2,
  NO_REPLY_SINCE_REQUEST: 3,
  ONLY_COPIED: -2,
  AUTOMATED_SENDER: -4,
  NOISE_LABEL: -4,
  COMPLETED_LANGUAGE: -3
});

const TRIAGE_NOISE_LABELS = ['Auto-file', 'News', 'Elevator'];
const TRIAGE_EXCEPTION_LABELS = ['Jira', 'ServiceNow', 'scripts', 'Elevator'];
const TRIAGE_CARRY_IN_LABELS = ['_NCMMS', '_NCMMS/COR-TRM', '_NCMMS/Acquisition', 'OFM', 'IT', 'P&S Tech & Innovation'];
const TRIAGE_REQUEST_RE = /\b(please|can you|could you|would you|will you|need you to|i need|we need|kindly|action required|let me know|requesting|your approval|your review)\b/i;
const TRIAGE_DEADLINE_RE = /\b(by|before|due|deadline|no later than|until|asap|eod|cob|today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|this week|next week|\d{1,2}\/\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2})\b/i;
const TRIAGE_COMPLETED_RE = /\b(resolved|completed|closed|no further action|issue is fixed|marked as done)\b/i;
const TRIAGE_AUTOMATED_RE = /(no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer-daemon|notifications?@|alerts?@|automated@|postmaster@|bounce)/i;
const TRIAGE_PROXIMITY_CHARS = 100;

function triageAddress(raw) {
  const s = String(raw || '');
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim().toLowerCase();
}

function triageHasAddress(list, email) {
  return Array.isArray(list) && list.some((a) => triageAddress(a) === email);
}

function triageHasLabel(labels, name, orChild = false) {
  const n = name.toLowerCase();
  return labels.some((l) => {
    const x = String(l).toLowerCase();
    return x === n || (orChild && x.startsWith(n + '/'));
  });
}

function triageNearRequest(body) {
  const req = body.match(TRIAGE_REQUEST_RE);
  if (!req) return false;
  const lo = Math.max(0, req.index - TRIAGE_PROXIMITY_CHARS);
  const hi = req.index + req[0].length + TRIAGE_PROXIMITY_CHARS;
  return TRIAGE_DEADLINE_RE.test(body.slice(lo, hi));
}

function triageValidate(thread) {
  if (!thread || typeof thread !== 'object') throw new Error('scoreThread: thread object required');
  if (!Array.isArray(thread.labels)) throw new Error('scoreThread: thread.labels must be an array');
  if (!Array.isArray(thread.messages) || thread.messages.length === 0) {
    throw new Error('scoreThread: thread.messages must be a non-empty array');
  }
  if (typeof thread.userEmail !== 'string' || thread.userEmail === '') {
    throw new Error('scoreThread: thread.userEmail required');
  }
}

function triageWeights(config) {
  const over = (config && config.weights) || {};
  for (const k of Object.keys(over)) {
    if (!(k in TRIAGE_DEFAULT_WEIGHTS)) throw new Error(`scoreThread: unknown weight '${k}'`);
    if (typeof over[k] !== 'number' || Number.isNaN(over[k])) throw new Error(`scoreThread: weight '${k}' must be a number`);
  }
  return { ...TRIAGE_DEFAULT_WEIGHTS, ...over };
}

function triageBand(score) {
  if (score >= 8) return TRIAGE_BAND.HIGH_CONFIDENCE;
  if (score >= 4) return TRIAGE_BAND.HUMAN_REVIEW;
  if (score >= 0) return TRIAGE_BAND.LIKELY_FYI;
  return TRIAGE_BAND.NOISE;
}

/**
 * Score a thread. Returns a frozen {score, band, signals[], autoCreate:false}; never an action.
 * @param {{labels:string[], userEmail:string, messages:Array<{from:string,to:string[],cc:string[],date:string,bodyText:string,isFromUser:boolean}>}} thread
 * @param {{weights?:Object<string,number>, automatedSenders?:string[]}} [config]
 */
export function scoreThread(thread, config) {
  triageValidate(thread);
  const w = triageWeights(config);
  const me = triageAddress(thread.userEmail);
  const labels = thread.labels;
  const msgs = thread.messages;
  const signals = [];
  const add = (id, reason) => signals.push({ id, points: w[id], reason });

  let latestOtherIdx = -1;
  msgs.forEach((m, i) => { if (!m.isFromUser) latestOtherIdx = i; });
  const latestOther = latestOtherIdx >= 0 ? msgs[latestOtherIdx] : null;

  if (latestOther) {
    if (triageHasAddress(latestOther.to, me)) add('DIRECT_TO', 'User is in To');
    else if (triageHasAddress(latestOther.cc, me)) add('ONLY_COPIED', 'User is only copied');
    if (latestOtherIdx === msgs.length - 1) add('LATEST_FROM_OTHER', 'Latest message is from someone else');
    const extra = (config && config.automatedSenders) || [];
    const from = triageAddress(latestOther.from);
    if (TRIAGE_AUTOMATED_RE.test(from) || extra.some((s) => from.includes(String(s).toLowerCase()))) {
      add('AUTOMATED_SENDER', 'Known automated sender');
    }
  }

  let requestIdx = -1;
  msgs.forEach((m, i) => { if (!m.isFromUser && TRIAGE_REQUEST_RE.test(m.bodyText || '')) requestIdx = i; });
  if (requestIdx >= 0) {
    add('EXPLICIT_REQUEST', 'Explicit request phrase');
    if (triageNearRequest(msgs[requestIdx].bodyText)) add('DEADLINE_NEAR_REQUEST', 'Deadline language near request');
    if (!msgs.slice(requestIdx + 1).some((m) => m.isFromUser)) add('NO_REPLY_SINCE_REQUEST', 'No user reply since request');
  }

  if (triageHasLabel(labels, 'VIP')) add('VIP', 'VIP label');
  if (TRIAGE_NOISE_LABELS.some((l) => triageHasLabel(labels, l))) add('NOISE_LABEL', 'Auto-file/News/Elevator label');
  if (TRIAGE_COMPLETED_RE.test(msgs[msgs.length - 1].bodyText || '')) add('COMPLETED_LANGUAGE', 'Completed/resolved/closed language');

  const score = signals.reduce((sum, s) => sum + s.points, 0);
  return Object.freeze({ score, band: triageBand(score), signals, autoCreate: false });
}

/**
 * Assign a triage queue. Existing labels (00_AR, FYI_Candidate, ...) are hints only.
 * @param {{labels:string[], ledgerStatus?:string}} thread ledgerStatus ERROR forces System Exceptions.
 * @param {{band:string}} scoreResult
 * @returns {string} one of TRIAGE_QUEUE values
 */
export function queueFor(thread, scoreResult) {
  if (!thread || !Array.isArray(thread.labels)) throw new Error('queueFor: thread.labels must be an array');
  if (!scoreResult || !(scoreResult.band in TRIAGE_BAND)) throw new Error('queueFor: valid scoreResult required');
  const labels = thread.labels;
  const band = scoreResult.band;
  // A failed hub operation needs the user's Retry, so it beats every band and label rule.
  if (thread.ledgerStatus === LEDGER_STATUS.ERROR) return TRIAGE_QUEUE.SYSTEM_EXCEPTIONS;
  if (TRIAGE_EXCEPTION_LABELS.some((l) => triageHasLabel(labels, l))) return TRIAGE_QUEUE.SYSTEM_EXCEPTIONS;
  if (band === TRIAGE_BAND.HIGH_CONFIDENCE) return TRIAGE_QUEUE.DIRECT_ACTION;
  if (band === TRIAGE_BAND.NOISE) return TRIAGE_QUEUE.FYI_READING;
  if (TRIAGE_CARRY_IN_LABELS.some((l) => triageHasLabel(labels, l, true))) return TRIAGE_QUEUE.MEETING_CARRY_INS;
  if (band === TRIAGE_BAND.HUMAN_REVIEW) return TRIAGE_QUEUE.DIRECT_ACTION;
  return TRIAGE_QUEUE.FYI_READING;
}
