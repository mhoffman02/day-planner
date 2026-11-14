/**
 * @file Notes Topic picker and card category chips share the Tasks category list.
 * Pure helpers, hand-mirrored into gas-app/Script.html.
 */

/** Shared categories shown as chips on a card before the "+" overflow. */
export const CARD_CHIP_LIMIT = 5;

/** Rows in the Topic dropdown before the user types. */
export const TOPIC_LIST_LIMIT = 20;

/** Rows once the user types: matches from the deeper topic history. */
export const TOPIC_MATCH_LIMIT = 50;

/** Topics kept in the saved history the dropdown searches. */
export const TOPIC_HISTORY_LIMIT = 70;

function cleanList(values) {
  return (Array.isArray(values) ? values : [])
    .filter(v => typeof v === 'string' && v.trim())
    .map(v => v.trim());
}

function uniqueCaseless(values) {
  const seen = new Set();
  return values.filter(v => {
    const key = v.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Topic picker options: each source in order (Task categories, then topics used before),
 * case-insensitive dedupe.
 * @param {...string[]} sources
 * @returns {string[]}
 */
export function mergeTopicOptions(...sources) {
  return uniqueCaseless(sources.flatMap(cleanList));
}

/**
 * Rows shown in the Topic dropdown. Until the user edits the value saved at focus, the first
 * TOPIC_LIST_LIMIT options show; after that, up to TOPIC_MATCH_LIMIT options containing the
 * typed text, so an old topic deep in the history comes back after a few letters.
 * @param {string[]} options Merged options.
 * @param {string} value Current input text.
 * @param {string} focusValue Input text when the field got focus.
 * @returns {string[]}
 */
export function topicDropdownItems(options, value, focusValue) {
  const list = Array.isArray(options) ? options : [];
  const q = (value || '').trim().toLowerCase();
  if (!q || q === (focusValue || '').trim().toLowerCase()) return list.slice(0, TOPIC_LIST_LIMIT);
  return list.filter(t => t.toLowerCase().includes(q)).slice(0, TOPIC_MATCH_LIMIT);
}

/**
 * Card chip row: categories on this card plus the most recent shared categories up to
 * limit, alphabetical; the remaining shared categories go behind the "+" overflow.
 * @param {string[]} recentCategories Shared categories, most recent first.
 * @param {string[]} selected Categories on this card.
 * @param {number} [limit=CARD_CHIP_LIMIT]
 * @returns {{visible: string[], overflow: string[]}}
 */
export function cardChipOptions(recentCategories, selected, limit = CARD_CHIP_LIMIT) {
  const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
  const shared = uniqueCaseless(cleanList(recentCategories));
  const visible = uniqueCaseless([...cleanList(selected), ...shared.slice(0, limit)]);
  const shown = new Set(visible.map(v => v.toLowerCase()));
  const overflow = shared.filter(c => !shown.has(c.toLowerCase()));
  return { visible: visible.sort(byName), overflow: overflow.sort(byName) };
}

/**
 * Categories offered by the Notes category filter: shared categories plus any found on cards.
 * @param {string[]} categories Shared categories.
 * @param {Array<{categories?: string[], category?: string}>} cards Loaded note cards.
 * @returns {string[]}
 */
export function noteFilterCategories(categories, cards) {
  const onCards = [];
  (Array.isArray(cards) ? cards : []).forEach(c => {
    if (Array.isArray(c && c.categories)) onCards.push(...c.categories);
    else if (c && typeof c.category === 'string') onCards.push(...c.category.split(','));
  });
  return uniqueCaseless([...cleanList(categories), ...cleanList(onCards)])
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
