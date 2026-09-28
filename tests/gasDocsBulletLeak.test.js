/**
 * @file gasDocsBulletLeak.test.js
 * @description Reproduces the "#category: Work" tag leak into note body content.
 * Mirrors the real Docs Advanced Service structural-element shape used by
 * gas-app/Code.gs's docsGetBodyElements_/buildDaySectionRequests_ (not DocumentApp, which
 * gasDocIdempotency.test.js mocks) so it actually exercises the paragraph-style/bullet
 * inheritance behavior those functions rely on.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Docs Advanced Service day-section bullet inheritance', () => {
  // Minimal in-memory model of a Docs API document body: a flat array of paragraph
  // structural elements, each with a namedStyleType, an optional bullet flag, and text runs.
  function createDoc() {
    return { elements: [] };
  }

  function addParagraph(doc, text, { style = 'NORMAL_TEXT', bullet = false } = {}) {
    const startIndex = doc.elements.length === 0 ? 1 : doc.elements[doc.elements.length - 1].endIndex;
    const endIndex = startIndex + text.length + 1;
    doc.elements.push({
      startIndex,
      endIndex,
      paragraph: {
        paragraphStyle: { namedStyleType: style },
        bullet: bullet ? {} : undefined,
        elements: [{ textRun: { content: text + '\n' } }]
      }
    });
  }

  // Mirrors gas-app/Code.gs docsElementText_/docsElementHeading_/docsElementIsListItem_.
  function elementText(el) {
    return el.paragraph.elements.map(pe => (pe.textRun && pe.textRun.content) || '').join('').replace(/\n$/, '');
  }
  function elementHeading(el) {
    return (el.paragraph.paragraphStyle && el.paragraph.paragraphStyle.namedStyleType) || 'NORMAL_TEXT';
  }
  function elementIsListItem(el) {
    return !!el.paragraph.bullet;
  }

  // Mirrors gas-app/Code.gs buildDaySectionRequests_: builds insert text plus style/bullet
  // requests, WITHOUT a deleteParagraphBullets reset (the current, buggy behavior).
  function buildDaySectionRequests(baseIndex, dayHeadingText, lines, { clearBullets } = {}) {
    let text = '';
    const styleReqs = [];
    const bulletRanges = [];

    function appendLine(str, kind) {
      const start = baseIndex + text.length;
      text += str + '\n';
      const end = baseIndex + text.length - 1;
      if (kind === 'H2' || kind === 'H3') {
        styleReqs.push({ range: { start, end }, style: kind === 'H2' ? 'HEADING_2' : 'HEADING_3' });
      } else if (kind === 'BULLET') {
        bulletRanges.push({ start, end });
      }
    }

    appendLine(dayHeadingText, 'H2');
    lines.forEach(line => {
      if (line.indexOf('### ') === 0) {
        appendLine(line.replace('### ', ''), 'H3');
      } else if (line.indexOf('- ') === 0) {
        appendLine(line.replace('- ', ''), 'BULLET');
      } else if (line.trim()) {
        appendLine(line, 'NORMAL');
      }
    });

    return { text, styleReqs, bulletRanges, clearBullets: !!clearBullets };
  }

  // Applies a build plan onto a doc at baseIndex, simulating Docs API paragraph-style/bullet
  // inheritance from whatever paragraph previously sat at the insertion point.
  function applyPlan(doc, baseIndex, plan, inheritedBullet) {
    const lines = plan.text.split('\n').filter((_, i, arr) => i < arr.length - 1);
    let bulletActive = plan.clearBullets ? false : inheritedBullet;
    lines.forEach((lineText, i) => {
      const start = baseIndex + plan.text.split('\n').slice(0, i).join('\n').length + (i > 0 ? 1 : 0);
      const styleReq = plan.styleReqs.find(r => r.range.start === start);
      const isBulletLine = plan.bulletRanges.some(r => r.start === start);
      const style = styleReq ? styleReq.style : 'NORMAL_TEXT';
      const bullet = isBulletLine || bulletActive;
      addParagraph(doc, lineText, { style, bullet });
    });
  }

  function saveDaySection(doc, dateStr, noteContent, { clearBullets } = {}) {
    const dayHeadingText = 'Day Planner - ' + dateStr;
    const lines = (noteContent || '').split('\n');

    let dayHeadingIndex = -1;
    for (let i = 0; i < doc.elements.length; i++) {
      if (elementHeading(doc.elements[i]) === 'HEADING_2' && elementText(doc.elements[i]) === dayHeadingText) {
        dayHeadingIndex = i;
        break;
      }
    }

    const plan = buildDaySectionRequests(0, dayHeadingText, lines, { clearBullets });

    if (dayHeadingIndex === -1) {
      // New day: inherits whatever bullet state the doc's last existing paragraph had.
      const lastEl = doc.elements[doc.elements.length - 1];
      const inherited = lastEl ? elementIsListItem(lastEl) : false;
      applyPlan(doc, 0, plan, inherited);
      return;
    }

    // Idempotent replace: delete this day's section, then re-insert at the same spot. The
    // paragraph immediately preceding the deletion point (the last surviving paragraph of the
    // prior section, or doc start) is what the new text inherits style/bullet from.
    let endIndex = doc.elements.length;
    for (let j = dayHeadingIndex + 1; j < doc.elements.length; j++) {
      if (elementHeading(doc.elements[j]) === 'HEADING_2') {
        endIndex = j;
        break;
      }
    }
    const precedingEl = doc.elements[dayHeadingIndex - 1];
    const inherited = precedingEl ? elementIsListItem(precedingEl) : false;
    doc.elements.splice(dayHeadingIndex, endIndex - dayHeadingIndex);
    const insertPos = doc.elements.slice(0, dayHeadingIndex);
    const rest = doc.elements.slice(dayHeadingIndex);
    doc.elements = insertPos;
    applyPlan(doc, 0, plan, inherited);
    doc.elements = doc.elements.concat(rest);
  }

  function readDaySection(doc, dateStr) {
    const dayHeadingText = 'Day Planner - ' + dateStr;
    let dayHeadingIndex = -1;
    for (let i = 0; i < doc.elements.length; i++) {
      if (elementHeading(doc.elements[i]) === 'HEADING_2' && elementText(doc.elements[i]) === dayHeadingText) {
        dayHeadingIndex = i;
        break;
      }
    }
    if (dayHeadingIndex === -1) return null;
    const contentLines = [];
    for (let j = dayHeadingIndex + 1; j < doc.elements.length; j++) {
      const el = doc.elements[j];
      if (elementHeading(el) === 'HEADING_2') break;
      const heading = elementHeading(el);
      const text = elementText(el);
      if (heading === 'HEADING_3') {
        contentLines.push('### ' + text);
      } else if (elementIsListItem(el)) {
        contentLines.push('- ' + text);
      } else if (text.trim()) {
        contentLines.push(text);
      }
    }
    return contentLines.join('\n');
  }

  it('leaks a bullet-inherited #category tag into content on repeated save/load (current buggy behavior)', () => {
    const doc = createDoc();

    // A prior day's section ends with a bulleted line, as the app's own default new-day
    // content does ("- Initialized daily topic card.").
    saveDaySection(doc, '2026-09-27', '- Some earlier bullet note');

    // User writes a plain note on a future date; the client always emits a heading + a
    // #category tag line for each card.
    saveDaySection(doc, '2026-09-29', '### General Notes\n#category: Work\nMy plan for tomorrow');

    let extracted = readDaySection(doc, '2026-09-29');
    // BUG: without a bullet-clear reset, the new day's paragraphs inherit the preceding
    // section's bullet state, so the tag line round-trips as "- #category: Work" instead of
    // "#category: Work" -- which the client's tag regex does not recognize.
    assert.equal(extracted, '### General Notes\n- #category: Work\n- My plan for tomorrow');

    // Simulating the client: it can't parse "- #category: Work" as a tag, so it becomes card
    // content, and the client writes a FRESH #category line on top when it saves again --
    // this is the reported "tags accumulate every time I navigate back" symptom.
    const reSaved = extracted + '\n#category: Work';
    saveDaySection(doc, '2026-09-29', reSaved);
    extracted = readDaySection(doc, '2026-09-29');
    const tagCount = (extracted.match(/#category:/g) || []).length;
    assert.equal(tagCount, 2, 'each round-trip through the buggy save path adds one more leaked tag line');
  });

  it('does not leak a bullet-inherited tag once bullets are explicitly cleared on every save', () => {
    const doc = createDoc();
    saveDaySection(doc, '2026-09-27', '- Some earlier bullet note');
    saveDaySection(doc, '2026-09-29', '### General Notes\n#category: Work\nMy plan for tomorrow', { clearBullets: true });

    const extracted = readDaySection(doc, '2026-09-29');
    assert.equal(extracted, '### General Notes\n#category: Work\nMy plan for tomorrow');
  });
});
