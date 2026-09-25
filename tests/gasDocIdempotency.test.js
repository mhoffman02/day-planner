/**
 * @file gasDocIdempotency.test.js
 * @description Unit tests for Google Doc idempotent day section replacement and card extraction.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Google Doc Idempotency & Extraction Tests', () => {
  // Minimal DocumentApp mock matching Google Apps Script object model
  function createMockDoc() {
    const ElementType = {
      PARAGRAPH: 'PARAGRAPH',
      LIST_ITEM: 'LIST_ITEM',
      PAGE_BREAK: 'PAGE_BREAK'
    };

    const ParagraphHeading = {
      HEADING1: 'HEADING1',
      HEADING2: 'HEADING2',
      HEADING3: 'HEADING3',
      NORMAL_TEXT: 'NORMAL_TEXT'
    };

    class MockElement {
      constructor(type, text = '') {
        this.type = type;
        this.text = text;
        this.heading = ParagraphHeading.NORMAL_TEXT;
      }
      getType() { return this.type; }
      getText() { return this.text; }
      getHeading() { return this.heading; }
      setHeading(h) { this.heading = h; return this; }
      asParagraph() { return this; }
      asListItem() { return this; }
    }

    const children = [];

    const body = {
      getNumChildren() { return children.length; },
      getChild(i) { return children[i]; },
      appendParagraph(text) {
        const el = new MockElement(ElementType.PARAGRAPH, text);
        children.push(el);
        return el;
      },
      appendListItem(text) {
        const el = new MockElement(ElementType.LIST_ITEM, text);
        children.push(el);
        return el;
      },
      appendPageBreak() {
        const el = new MockElement(ElementType.PAGE_BREAK);
        children.push(el);
        return el;
      },
      insertParagraph(index, text) {
        const el = new MockElement(ElementType.PARAGRAPH, text);
        children.splice(index, 0, el);
        return el;
      },
      insertListItem(index, text) {
        const el = new MockElement(ElementType.LIST_ITEM, text);
        children.splice(index, 0, el);
        return el;
      },
      removeChild(child) {
        const idx = children.indexOf(child);
        if (idx !== -1) {
          if (children.length <= 1) {
            throw new Error("Can't remove the last paragraph in a document body.");
          }
          children.splice(idx, 1);
        }
      }
    };

    return { body, ElementType, ParagraphHeading, children };
  }

  function runSaveDailyDocCards(mock, dateStr, noteContent) {
    const { body, ElementType, ParagraphHeading } = mock;
    const parts = dateStr.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
    const dayFormatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const dayHeadingText = 'Day Planner - ' + dayFormatted;

    function isDayHeading(element) {
      if (!element || element.getType() !== ElementType.PARAGRAPH) return false;
      const heading = element.getHeading();
      const text = element.getText().trim();
      if (heading === ParagraphHeading.HEADING2 || text.indexOf('Day Planner - ') === 0 || text.indexOf('## ') === 0) {
        if (text.indexOf(dateStr) !== -1 || text.indexOf(dayFormatted) !== -1) return true;
      }
      return false;
    }

    function isAnyDayHeading(element) {
      if (!element || element.getType() !== ElementType.PARAGRAPH) return false;
      const heading = element.getHeading();
      const text = element.getText().trim();
      if (heading === ParagraphHeading.HEADING2) return true;
      if (text.indexOf('Day Planner - ') === 0 || text.indexOf('## ') === 0) return true;
      return false;
    }

    const numChildren = body.getNumChildren();
    let dayHeadingIndex = -1;

    for (let i = 0; i < numChildren; i++) {
      if (isDayHeading(body.getChild(i))) {
        dayHeadingIndex = i;
        break;
      }
    }

    const lines = (noteContent || '').split('\n');

    if (dayHeadingIndex !== -1) {
      let endIndex = numChildren;
      for (let j = dayHeadingIndex + 1; j < numChildren; j++) {
        const nextChild = body.getChild(j);
        if (isAnyDayHeading(nextChild)) {
          if (j > 0 && body.getChild(j - 1).getType() === ElementType.PAGE_BREAK) {
            endIndex = j - 1;
          } else {
            endIndex = j;
          }
          break;
        }
      }

      if (body.getNumChildren() <= (endIndex - dayHeadingIndex)) {
        body.insertParagraph(0, 'Day Planner Notes - Title').setHeading(ParagraphHeading.HEADING1);
        dayHeadingIndex++;
        endIndex++;
      }

      for (let k = endIndex - 1; k >= dayHeadingIndex; k--) {
        body.removeChild(body.getChild(k));
      }

      let insertIndex = dayHeadingIndex;
      const h2 = body.insertParagraph(insertIndex++, dayHeadingText);
      h2.setHeading(ParagraphHeading.HEADING2);

      lines.forEach(line => {
        if (line.indexOf('### ') === 0) {
          const h3 = body.insertParagraph(insertIndex++, line.replace('### ', ''));
          h3.setHeading(ParagraphHeading.HEADING3);
        } else if (line.indexOf('- ') === 0) {
          body.insertListItem(insertIndex++, line.replace('- ', ''));
        } else if (line.trim()) {
          body.insertParagraph(insertIndex++, line);
        }
      });
    } else {
      if (numChildren > 0 && body.getChild(numChildren - 1).getType() !== ElementType.PAGE_BREAK) {
        body.appendPageBreak();
      }
      body.appendParagraph(dayHeadingText).setHeading(ParagraphHeading.HEADING2);

      lines.forEach(line => {
        if (line.indexOf('### ') === 0) {
          body.appendParagraph(line.replace('### ', '')).setHeading(ParagraphHeading.HEADING3);
        } else if (line.indexOf('- ') === 0) {
          body.appendListItem(line.replace('- ', ''));
        } else if (line.trim()) {
          body.appendParagraph(line);
        }
      });
    }

    return { success: true };
  }

  function runGetDailyDocContent(mock, dateStr) {
    const { body, ElementType, ParagraphHeading } = mock;
    const parts = dateStr.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
    const dayFormatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    function isDayHeading(element) {
      if (!element || element.getType() !== ElementType.PARAGRAPH) return false;
      const heading = element.getHeading();
      const text = element.getText().trim();
      if (heading === ParagraphHeading.HEADING2 || text.indexOf('Day Planner - ') === 0 || text.indexOf('## ') === 0) {
        if (text.indexOf(dateStr) !== -1 || text.indexOf(dayFormatted) !== -1) return true;
      }
      return false;
    }

    function isAnyDayHeading(element) {
      if (!element || element.getType() !== ElementType.PARAGRAPH) return false;
      const heading = element.getHeading();
      const text = element.getText().trim();
      if (heading === ParagraphHeading.HEADING2) return true;
      if (text.indexOf('Day Planner - ') === 0 || text.indexOf('## ') === 0) return true;
      return false;
    }

    const numChildren = body.getNumChildren();
    let dayHeadingIndex = -1;

    for (let i = 0; i < numChildren; i++) {
      if (isDayHeading(body.getChild(i))) {
        dayHeadingIndex = i;
        break;
      }
    }

    if (dayHeadingIndex !== -1) {
      const contentLines = [];
      for (let j = dayHeadingIndex + 1; j < numChildren; j++) {
        const el = body.getChild(j);
        if (isAnyDayHeading(el)) break;
        const type = el.getType();
        if (type === ElementType.PARAGRAPH) {
          const heading = el.getHeading();
          const text = el.getText();
          if (heading === ParagraphHeading.HEADING3) {
            contentLines.push('### ' + text);
          } else if (text.trim()) {
            contentLines.push(text);
          }
        } else if (type === ElementType.LIST_ITEM) {
          contentLines.push('- ' + el.getText());
        }
      }
      if (contentLines.length > 0) return contentLines.join('\n');
    }

    return '### #index [General] Daily Notes for ' + dateStr + '\n- Initialized daily topic card.';
  }

  it('should append initial day and extract its markdown cards', () => {
    const mock = createMockDoc();
    mock.body.appendParagraph('Day Planner Notes - September 2026').setHeading(mock.ParagraphHeading.HEADING1);

    const initialContent = '### #index [Arch] System Architecture\n- Scalable 3-column binder\nFinal design approved.';
    runSaveDailyDocCards(mock, '2026-09-25', initialContent);

    const extracted = runGetDailyDocContent(mock, '2026-09-25');
    assert.equal(extracted, initialContent);

    // Verify exactly 1 HEADING2 exists
    const h2Count = mock.children.filter(c => c.getHeading() === mock.ParagraphHeading.HEADING2).length;
    assert.equal(h2Count, 1);
  });

  it('should idempotently replace existing day section without duplicating upon re-save', () => {
    const mock = createMockDoc();
    mock.body.appendParagraph('Day Planner Notes - September 2026').setHeading(mock.ParagraphHeading.HEADING1);

    // Day 1
    runSaveDailyDocCards(mock, '2026-09-25', '### #index [Arch] V1\n- Note V1');
    // Day 2
    runSaveDailyDocCards(mock, '2026-09-26', '### #index [Finance] Q3\n- Budget review');

    assert.equal(mock.children.filter(c => c.getHeading() === mock.ParagraphHeading.HEADING2).length, 2);

    // Re-save Day 1 with updated content
    const updatedContentDay1 = '### #index [Arch] V2\n- Note V2 updated\nSecond paragraph';
    runSaveDailyDocCards(mock, '2026-09-25', updatedContentDay1);

    // Verify still exactly 2 HEADING2s (no duplication of Day 1)
    const h2Elements = mock.children.filter(c => c.getHeading() === mock.ParagraphHeading.HEADING2);
    assert.equal(h2Elements.length, 2);

    // Verify Day 1 content is updated
    const extractedDay1 = runGetDailyDocContent(mock, '2026-09-25');
    assert.equal(extractedDay1, updatedContentDay1);

    // Verify Day 2 content is intact and untouched
    const extractedDay2 = runGetDailyDocContent(mock, '2026-09-26');
    assert.equal(extractedDay2, '### #index [Finance] Q3\n- Budget review');
  });

  it('should idempotently replace the final day section at the end of the document', () => {
    const mock = createMockDoc();
    mock.body.appendParagraph('Day Planner Notes - September 2026').setHeading(mock.ParagraphHeading.HEADING1);

    runSaveDailyDocCards(mock, '2026-09-25', '### Day 1\n- Content 1');
    runSaveDailyDocCards(mock, '2026-09-26', '### Day 2\n- Content 2 Initial');

    // Update the last day
    const updatedDay2 = '### Day 2\n- Content 2 Overwritten';
    runSaveDailyDocCards(mock, '2026-09-26', updatedDay2);

    assert.equal(mock.children.filter(c => c.getHeading() === mock.ParagraphHeading.HEADING2).length, 2);
    assert.equal(runGetDailyDocContent(mock, '2026-09-26'), updatedDay2);
  });
});
