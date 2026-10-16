/**
 * @file filterSuggest.js
 * @description Pure filter recommender for the 🎯/ workflow labels. Learns from threads the user already
 * labelled (positives) and recent unlabelled Inbox threads (negatives): candidate Gmail search rules
 * (sender, sender domain, mailing list, subject phrase, domain + phrase) are scored by how many labelled
 * threads they catch and how many other threads they would wrongly catch. Headers only, never bodies.
 */

/** Thresholds: a rule must catch at least minCaught labelled threads at minPrecision or better. */
export const FILTER_SUGGEST_DEFAULTS = Object.freeze({ minCaught: 3, minPrecision: 0.9, maxPerLabel: 5, minNew: 2 });

const KIND_RANK = Object.freeze({ from: 0, list: 1, domain: 2, domainSubject: 3, subject: 4 });

const STOPWORDS =new Set(['the', 'and', 'for', 'you', 'your', 'with', 'from', 'this', 'that', 'are', 'was', 'our', 'have', 'has', 'not', 'all', 'can', 'will', 'please', 'fwd', 'fw', 're']);

/**
 * @param {string} subject Raw subject.
 * @returns {string[]} Lower-case word tokens without reply/forward prefixes or stopwords.
 */
export function subjectWords(subject) {
  const s = String(subject || '').toLowerCase().replace(/^((re|fw|fwd)\s*:\s*)+/g, '');
  return (s.match(/[a-z0-9][a-z0-9&-]{2,}/g) || []).filter((w) => !STOPWORDS.has(w));
}

/**
 * @param {{from?:string, listId?:string, subject?:string}} t Thread headers (first message).
 * @returns {{from:string, domain:string, listId:string, words:string[]}} Match features.
 */
export function threadFeatures(t) {
  const m = String(t.from || '').toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  const from = m ? m[0] : '';
  const lm = String(t.listId || '').toLowerCase().match(/<([^>]+)>/);
  return { from, domain: from ? from.split('@')[1] : '', listId: lm ? lm[1] : String(t.listId || '').toLowerCase().trim(), words: subjectWords(t.subject) };
}

function hasPhrase(words, phrase) {
  const p = phrase.split(' ');
  for (let i = 0; i + p.length <= words.length; i++) {
    if (p.every((w, j) => words[i + j] === w)) return true;
  }
  return false;
}

/**
 * @param {{kind:string, value:string, phrase?:string}} rule Candidate rule.
 * @param {{from:string, domain:string, listId:string, words:string[]}} f Thread features.
 * @returns {boolean} True when Gmail would match this thread.
 */
export function ruleMatches(rule, f) {
  if (rule.kind === 'from') return f.from === rule.value;
  if (rule.kind === 'domain') return f.domain === rule.value || f.domain.endsWith('.' + rule.value);
  if (rule.kind === 'list') return !!f.listId && f.listId === rule.value;
  if (rule.kind === 'subject') return hasPhrase(f.words, rule.value);
  if (rule.kind === 'domainSubject') return (f.domain === rule.value || f.domain.endsWith('.' + rule.value)) && hasPhrase(f.words, rule.phrase);
  return false;
}

/**
 * @param {{kind:string, value:string, phrase?:string}} rule Rule.
 * @returns {string} Gmail search query for a filter.
 */
export function ruleQuery(rule) {
  if (rule.kind === 'from') return `from:(${rule.value})`;
  if (rule.kind === 'domain') return `from:(@${rule.value})`;
  if (rule.kind === 'list') return `list:(${rule.value})`;
  if (rule.kind === 'subject') return `subject:("${rule.value}")`;
  return `from:(@${rule.value}) subject:("${rule.phrase}")`;
}

function phrases(words) {
  const out = new Set();
  for (let n = 1; n <= 3; n++) {
    for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(' '));
  }
  return [...out];
}

function candidates(pos) {
  const count = new Map();
  const add = (rule) => { const k = ruleQuery(rule); if (!count.has(k)) count.set(k, rule); };
  pos.forEach(({ f }) => {
    if (f.from) add({ kind: 'from', value: f.from });
    if (f.domain) add({ kind: 'domain', value: f.domain });
    if (f.listId) add({ kind: 'list', value: f.listId });
    phrases(f.words).forEach((p) => {
      add({ kind: 'subject', value: p });
      if (f.domain) add({ kind: 'domainSubject', value: f.domain, phrase: p });
    });
  });
  return [...count.values()];
}

/**
 * Suggests filters per 🎯/ label.
 * @param {{threads:Array<{id:string, labels:string[], from?:string, listId?:string, subject?:string}>,
 *   targetLabels:string[], excludedLabels?:string[], existingFilters?:Array<{id:string, label:string, rule:(object|null), query:string}>,
 *   options?:object}} input threads: labelled threads and unlabelled Inbox threads (labels [] or no target label).
 * @returns {{suggestions:Array<{label:string, query:string, caught:number, wrong:number, precision:number, coveredBy:string}>,
 *   existing:Array<{id:string, label:string, query:string, caught:(number|null), wrong:(number|null)}>, skipped:number}}
 */
export function suggestFilters(input) {
  const o = { ...FILTER_SUGGEST_DEFAULTS, ...(input.options || {}) };
  const excluded = input.excludedLabels || [];
  const isExcluded = (labels) => labels.some((l) => excluded.some((x) => l === x || l.startsWith(x)));
  const rows = [];
  let skipped = 0;
  (input.threads || []).forEach((t) => {
    const labels = t.labels || [];
    if (isExcluded(labels)) { skipped += 1; return; }
    rows.push({ id: t.id, labels, f: threadFeatures(t) });
  });
  const measure = (rule, label) => {
    let caught = 0;
    let wrong = 0;
    const ids = [];
    rows.forEach((r) => {
      if (!ruleMatches(rule, r.f)) return;
      if (r.labels.indexOf(label) !== -1) { caught += 1; ids.push(r.id); } else { wrong += 1; }
    });
    return { caught, wrong, ids, precision: caught + wrong ? caught / (caught + wrong) : 0 };
  };
  const existing = (input.existingFilters || []).map((x) => {
    const m = x.rule ? measure(x.rule, x.label) : null;
    return { id: x.id, label: x.label, query: x.query, caught: m ? m.caught : null, wrong: m ? m.wrong : null, ids: m ? m.ids : [] };
  });
  const suggestions = [];
  (input.targetLabels || []).forEach((label) => {
    const pos = rows.filter((r) => r.labels.indexOf(label) !== -1);
    const scored = candidates(pos).map((rule) => ({ rule, ...measure(rule, label) }))
      .filter((c) => c.caught >= o.minCaught && c.precision >= o.minPrecision)
      // Ties go to the sturdier rule: a sender or list outlasts a subject word.
      .sort((a, b) => (b.caught - a.caught) || (b.precision - a.precision) ||
        (KIND_RANK[a.rule.kind] - KIND_RANK[b.rule.kind]) || (ruleQuery(a.rule).length - ruleQuery(b.rule).length));
    const covered = new Set();
    let picked = 0;
    for (const c of scored) {
      if (picked >= o.maxPerLabel) break;
      const fresh = c.ids.filter((id) => !covered.has(id)).length;
      if (fresh < Math.min(o.minNew, c.caught)) continue;
      c.ids.forEach((id) => covered.add(id));
      const by = existing.find((e) => e.label === label && c.ids.length && c.ids.filter((id) => e.ids.indexOf(id) !== -1).length >= 0.9 * c.ids.length);
      suggestions.push({ label, query: ruleQuery(c.rule), caught: c.caught, wrong: c.wrong, precision: Math.round(c.precision * 100) / 100, coveredBy: by ? by.id : '' });
      picked += 1;
    }
  });
  return { suggestions, existing: existing.map(({ ids, ...e }) => e), skipped };
}
