// @file One list of axe-core tags for every accessibility run (live page, jsdom, Playwright, CDP).
// Why: axe's default run does not guarantee the WCAG 2.2 or Section 508 rule sets, and "all default rules" shifts
// between axe versions. Naming the standard here makes the conformance claim explicit and reviewable.
// Federal pages: Section 508 (Revised 2017) incorporates WCAG 2.0 A/AA; agencies now target WCAG 2.1/2.2 AA.
//
// Usage: await axe.run(document, { runOnly: { type: 'tag', values: AXE_TAGS } });
//        ratchet the per-rule violation counts (new project: zero, no baseline; legacy: counts only go down).
export const AXE_TAGS = [
  'wcag2a', 'wcag2aa',          // WCAG 2.0 A/AA, the Section 508 baseline
  'wcag21a', 'wcag21aa',        // WCAG 2.1
  'wcag22aa',                   // WCAG 2.2 (target-size, focus-not-obscured, redundant-entry, ...)
  'section508',                 // axe rules mapped to 508 criteria
  'best-practice'               // landmarks, heading order, region: cheap and usually right
];

/**
 * Pure helper so the tag set is unit-testable without a browser.
 * @param {Record<string, number>} counts Rule id -> violation count.
 * @param {Record<string, number>} baseline Rule id -> allowed count (empty for a new project).
 * @returns {string[]} A message per rule whose count rose or is new.
 */
export function axeRises(counts, baseline = {}) {
  return Object.entries(counts)
    .filter(([rule, n]) => n > (baseline[rule] || 0))
    .map(([rule, n]) => `axe ${rule}: ${n} > baseline ${baseline[rule] || 0}`);
}
