/**
 * @file gasDocIdempotency.test.js
 * @description Unit tests for idempotent day-section replacement and card extraction against
 * the Docs Advanced Service structural-element model gas-app/Code.gs actually uses
 * (Docs.Documents.get/batchUpdate), superseding the old DocumentApp-shaped mock this file used
 * before the 2026-09-27 documents-scope removal. Follows the same reimplementation-mock pattern
 * as tests/gasDocsBulletLeak.test.js -- Code.gs is an IIFE with no module.exports, so this is
 * the only way to unit-test its Docs-API logic from node. Ports docsElementText_/
 * docsElementHeading_/docsElementIsPageBreak_/docsElementIsListItem_/isDayHeadingElement_/
 * isAnyDayHeadingElement_/buildDaySectionRequests_ from gas-app/Code.gs near-verbatim.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Google Doc Idempotency & Extraction Tests', () => {
  // Minimal in-memory model of a Docs API document body: a flat array of paragraph structural
  // elements, each shaped like Docs.Documents.get()'s body.content entries.
  function createDoc() {
    return { elements: [] };
  }

  function paragraphElement(text, { style = 'NORMAL_TEXT', bullet = false } = {}) {
    return {
      paragraph: {
        paragraphStyle: { namedStyleType: style },
        bullet: bullet ? {} : undefined,
        elements: [{ textRun: { content: text + '\n' } }]
      }
    };
  }

  function pageBreakElement() {
    return { paragraph: { elements: [{ pageBreak: {} }] } };
  }

  // Mirrors gas-app/Code.gs docsElementText_.
  function elementText(el) {
    if (!el.paragraph || !el.paragraph.elements) return '';
    return el.paragraph.elements.map(pe => (pe.textRun && pe.textRun.content) || '').join('').replace(/\n$/, '');
  }
  // Mirrors gas-app/Code.gs docsElementHeading_.
  function elementHeading(el) {
    return (el.paragraph && el.paragraph.paragraphStyle && el.paragraph.paragraphStyle.namedStyleType) || 'NORMAL_TEXT';
  }
  // Mirrors gas-app/Code.gs docsElementIsPageBreak_.
  function elementIsPageBreak(el) {
    if (!el.paragraph || !el.paragraph.elements) return false;
    return el.paragraph.elements.some(pe => !!pe.pageBreak);
  }
  // Mirrors gas-app/Code.gs docsElementIsListItem_.
  function elementIsListItem(el) {
    return !!(el.paragraph && el.paragraph.bullet);
  }

  // Mirrors gas-app/Code.gs isDayHeadingElement_.
  function isDayHeadingElement(element, dateStr, dayFormatted) {
    if (!element) return false;
    const heading = elementHeading(element);
    const text = elementText(element).trim();
    if (heading === 'HEADING_2' || text.indexOf('Day Planner - ') === 0 || text.indexOf('## ') === 0) {
      if (text.indexOf(dateStr) !== -1 || (dayFormatted && text.indexOf(dayFormatted) !== -1)) return true;
    }
    return false;
  }

  // Mirrors gas-app/Code.gs isAnyDayHeadingElement_.
  function isAnyDayHeadingElement(element) {
    if (!element) return false;
    const heading = elementHeading(element);
    const text = elementText(element).trim();
    if (heading === 'HEADING_2') return true;
    if (text.indexOf('Day Planner - ') === 0 || text.indexOf('## ') === 0) return true;
    return false;
  }

  // Mirrors gas-app/Code.gs buildDaySectionRequests_'s line-kind classification: an H2 day
  // heading followed by markdown-ish lines (### -> H3, "- " -> bullet, else plain), with every
  // line always reset to NORMAL_TEXT/no-bullet before its specific style is applied -- the fix
  // for the bullet/heading-inheritance leak that buildDaySectionRequests_'s resetReq/
  // bulletResetReq requests apply in production.
  function planDaySection(dayHeadingText, lines) {
    const planned = [{ text: dayHeadingText, style: 'HEADING_2', bullet: false }];
    lines.forEach(line => {
      if (line.indexOf('### ') === 0) {
        planned.push({ text: line.replace('### ', ''), style: 'HEADING_3', bullet: false });
      } else if (line.indexOf('- ') === 0) {
        planned.push({ text: line.replace('- ', ''), style: 'NORMAL_TEXT', bullet: true });
      } else if (line.trim()) {
        planned.push({ text: line, style: 'NORMAL_TEXT', bullet: false });
      }
    });
    return planned;
  }

  function planToElements(planned) {
    return planned.map(p => paragraphElement(p.text, { style: p.style, bullet: p.bullet }));
  }

  // Mirrors gas-app/Code.gs saveDailyDocCards's element-level delete/insert flow (the
  // deleteContentRange + insertText + style-request batchUpdate, applied directly to the
  // elements array instead of via character-index math, since that bookkeeping is Docs API's
  // own responsibility and not what these tests are verifying).
  function saveDaySection(doc, dateStr, noteContent) {
    const parts = dateStr.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
    const dayFormatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const dayHeadingText = 'Day Planner - ' + dayFormatted;
    const lines = (noteContent || '').split('\n');
    const planned = planDaySection(dayHeadingText, lines);

    let dayHeadingIndex = -1;
    for (let i = 0; i < doc.elements.length; i++) {
      if (isDayHeadingElement(doc.elements[i], dateStr, dayFormatted)) {
        dayHeadingIndex = i;
        break;
      }
    }

    if (dayHeadingIndex !== -1) {
      let endElIndex = doc.elements.length;
      for (let j = dayHeadingIndex + 1; j < doc.elements.length; j++) {
        if (isAnyDayHeadingElement(doc.elements[j])) {
          if (j > 0 && elementIsPageBreak(doc.elements[j - 1])) {
            endElIndex = j - 1;
          } else {
            endElIndex = j;
          }
          break;
        }
      }
      doc.elements.splice(dayHeadingIndex, endElIndex - dayHeadingIndex, ...planToElements(planned));
    } else {
      const lastElement = doc.elements[doc.elements.length - 1];
      const insertion = planToElements(planned);
      if (lastElement && !elementIsPageBreak(lastElement)) {
        doc.elements.push(pageBreakElement(), ...insertion);
      } else {
        doc.elements.push(...insertion);
      }
    }

    return { success: true };
  }

  // Mirrors gas-app/Code.gs getOrCreateDailyDocContent's extraction loop.
  function getDaySection(doc, dateStr) {
    const parts = dateStr.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
    const dayFormatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    let dayHeadingIndex = -1;
    for (let i = 0; i < doc.elements.length; i++) {
      if (isDayHeadingElement(doc.elements[i], dateStr, dayFormatted)) {
        dayHeadingIndex = i;
        break;
      }
    }

    if (dayHeadingIndex === -1) {
      return '### #index [General] Daily Notes for ' + dateStr + '\n- Initialized daily topic card.';
    }

    const contentLines = [];
    for (let j = dayHeadingIndex + 1; j < doc.elements.length; j++) {
      const el = doc.elements[j];
      if (isAnyDayHeadingElement(el)) break;
      if (elementIsPageBreak(el)) continue;
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
    return contentLines.length > 0
      ? contentLines.join('\n')
      : '### #index [General] Daily Notes for ' + dateStr + '\n- Initialized daily topic card.';
  }

  it('should append initial day and extract its markdown cards', () => {
    const doc = createDoc();
    const initialContent = '### #index [Arch] System Architecture\n- Scalable 3-column binder\nFinal design approved.';
    saveDaySection(doc, '2026-09-25', initialContent);

    const extracted = getDaySection(doc, '2026-09-25');
    assert.equal(extracted, initialContent);

    const h2Count = doc.elements.filter(el => elementHeading(el) === 'HEADING_2').length;
    assert.equal(h2Count, 1);
  });

  it('should idempotently replace existing day section without duplicating upon re-save', () => {
    const doc = createDoc();
    saveDaySection(doc, '2026-09-25', '### #index [Arch] V1\n- Note V1');
    saveDaySection(doc, '2026-09-26', '### #index [Finance] Q3\n- Budget review');

    assert.equal(doc.elements.filter(el => elementHeading(el) === 'HEADING_2').length, 2);

    const updatedContentDay1 = '### #index [Arch] V2\n- Note V2 updated\nSecond paragraph';
    saveDaySection(doc, '2026-09-25', updatedContentDay1);

    const h2Elements = doc.elements.filter(el => elementHeading(el) === 'HEADING_2');
    assert.equal(h2Elements.length, 2, 'Day 1 must be replaced in place, not duplicated');

    assert.equal(getDaySection(doc, '2026-09-25'), updatedContentDay1);
    assert.equal(getDaySection(doc, '2026-09-26'), '### #index [Finance] Q3\n- Budget review');
  });

  it('should idempotently replace the final day section at the end of the document', () => {
    const doc = createDoc();
    saveDaySection(doc, '2026-09-25', '### Day 1\n- Content 1');
    saveDaySection(doc, '2026-09-26', '### Day 2\n- Content 2 Initial');

    const updatedDay2 = '### Day 2\n- Content 2 Overwritten';
    saveDaySection(doc, '2026-09-26', updatedDay2);

    assert.equal(doc.elements.filter(el => elementHeading(el) === 'HEADING_2').length, 2);
    assert.equal(getDaySection(doc, '2026-09-26'), updatedDay2);
  });

  it('does not leak a bullet-inherited tag when a new day follows a bulleted section (reset always applied)', () => {
    const doc = createDoc();
    saveDaySection(doc, '2026-09-27', '- Some earlier bullet note');
    saveDaySection(doc, '2026-09-29', '### General Notes\n#category: Work\nMy plan for tomorrow');

    assert.equal(getDaySection(doc, '2026-09-29'), '### General Notes\n#category: Work\nMy plan for tomorrow');
  });
});
