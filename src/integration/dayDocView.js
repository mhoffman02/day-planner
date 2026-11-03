/**
 * @file dayDocView.js
 * @description Formats one day of the monthly notes Doc for the read-only Google Doc view. The output is a plain model
 * (blocks of runs), never HTML, so the client renders it with x-text and no sanitizer is involved.
 */

const DAY_DOC_HEADING_RE = /^HEADING_([3-6])$/;

function dayDocRun(el) {
  const tr = el && el.textRun;
  if (!tr || typeof tr.content !== 'string') return null;
  const style = tr.textStyle || {};
  const run = { text: tr.content };
  if (style.bold === true) run.bold = true;
  if (style.italic === true) run.italic = true;
  const url = style.link && style.link.url;
  if (typeof url === 'string' && /^https:\/\//i.test(url)) run.href = url;
  return run;
}

/**
 * @param {Array<object>} elements Docs API paragraph structural elements for the body of one day.
 * @returns {Array<{style: ('h3'|'li'|'p'), runs: Array<{text: string, bold?: boolean, italic?: boolean, href?: string}>}>}
 */
export function dayDocBlocks(elements) {
  const blocks = [];
  for (const el of elements || []) {
    const p = el && el.paragraph;
    if (!p || !Array.isArray(p.elements)) continue;
    const runs = p.elements.map(dayDocRun).filter(Boolean);
    if (runs.length > 0) runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\n$/, '');
    const kept = runs.filter((r) => r.text !== '');
    if (kept.length === 0 || kept.every((r) => r.text.trim() === '')) continue;
    const named = p.paragraphStyle && p.paragraphStyle.namedStyleType;
    const style = DAY_DOC_HEADING_RE.test(named || '') ? 'h3' : (p.bullet ? 'li' : 'p');
    blocks.push({ style, runs: kept });
  }
  return blocks;
}

/**
 * Deep link to the day heading in the Doc. Heading ids change on every app save, so build this from a fresh read and
 * never store it.
 * @param {string} docUrl The Doc edit URL.
 * @param {object|null} headingEl The day heading structural element.
 * @returns {string} The URL with #heading=<id>, or docUrl when the heading has no id.
 */
export function dayDocHeadingLink(docUrl, headingEl) {
  const id = headingEl && headingEl.paragraph && headingEl.paragraph.paragraphStyle && headingEl.paragraph.paragraphStyle.headingId;
  return id ? `${docUrl}#heading=${id}` : docUrl;
}
