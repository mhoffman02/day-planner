import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Note Cards Checklist Toggle & Special Characters (☐ / ☒)', () => {
  // Pure logic helpers matching Alpine implementation in src/app.js & gas-app/Script.html
  const isLineCheckbox = (line) => {
    if (!line || typeof line !== 'string') return false;
    return /^[☐☒☑]\s/.test(line) || /^-\s\[[ xX]?\]\s/.test(line) || /^\[[ xX]?\]\s/.test(line);
  };

  const isLineChecked = (line) => {
    if (!line || typeof line !== 'string') return false;
    return /^[☒☑]\s/.test(line) || /^-\s\[[xX]\]\s/.test(line) || /^\[[xX]\]\s/.test(line);
  };

  const getLineTextWithoutCheckbox = (line) => {
    if (!line || typeof line !== 'string') return '';
    return line.replace(/^[☐☒☑]\s/, '').replace(/^-\s\[[ xX]?\]\s/, '').replace(/^\[[ xX]?\]\s/, '');
  };

  const toggleLineCheckbox = (line) => {
    if (/^☐\s/.test(line)) {
      return '☒ ' + line.slice(2);
    } else if (/^[☒☑]\s/.test(line)) {
      return '☐ ' + line.slice(2);
    } else if (/^-\s\[\s?\]\s/.test(line)) {
      return '☒ ' + line.replace(/^-\s\[\s?\]\s/, '');
    } else if (/^-\s\[[xX]\]\s/.test(line)) {
      return '☐ ' + line.replace(/^-\s\[[xX]\]\s/, '');
    } else if (/^\[\s?\]\s/.test(line)) {
      return '☒ ' + line.replace(/^\[\s?\]\s/, '');
    } else if (/^\[[xX]\]\s/.test(line)) {
      return '☐ ' + line.replace(/^\[[xX]\]\s/, '');
    }
    return line;
  };

  const autoExpandInput = (val) => {
    let updatedVal = val;
    if (updatedVal.startsWith('[] ') || updatedVal.startsWith('[ ] ')) {
      updatedVal = '☐ ' + updatedVal.replace(/^\[\s?\]\s/, '');
    } else if (updatedVal.startsWith('- [ ] ') || updatedVal.startsWith('- [] ')) {
      updatedVal = '☐ ' + updatedVal.replace(/^-\s\[\s?\]\s/, '');
    } else if (updatedVal.startsWith('[x] ') || updatedVal.startsWith('[X] ')) {
      updatedVal = '☒ ' + updatedVal.replace(/^\[[xX]\]\s/, '');
    } else if (updatedVal.startsWith('- [x] ') || updatedVal.startsWith('- [X] ')) {
      updatedVal = '☒ ' + updatedVal.replace(/^-\s\[[xX]\]\s/, '');
    }
    return updatedVal;
  };

  const applyFormat = (line, formatType) => {
    const prefixMap = { bold: '**', italic: '*', strike: '~~', underline: '__' };
    if (formatType === 'clear') {
      return line.replace(/\*\*|~~|__|\*/g, '')
                 .replace(/\[\[color:[a-z]+\]\]/g, '')
                 .replace(/\[\[\/color\]\]/g, '')
                 .replace(/^(-\s|\d+\.\s|[☐☒☑]\s)/, '');
    }
    if (formatType === 'checklist') {
      if (/^☐\s/.test(line)) {
        return '☒ ' + line.slice(2);
      } else if (/^[☒☑]\s/.test(line)) {
        return line.slice(2);
      } else {
        if (line.startsWith('- ')) line = line.slice(2);
        else if (/^\d+\.\s/.test(line)) line = line.replace(/^\d+\.\s/, '');
        return `☐ ${line}`;
      }
    }
    if (formatType === 'bullet') {
      if (line.startsWith('- ')) return line.slice(2);
      if (/^[☐☒☑]\s/.test(line)) return `- ${line.slice(2)}`;
      if (/^\d+\.\s/.test(line)) return `- ${line.replace(/^\d+\.\s/, '')}`;
      return `- ${line}`;
    }
    if (formatType === 'ordered') {
      if (line.startsWith('- ')) line = line.slice(2);
      else if (/^[☐☒☑]\s/.test(line)) line = line.slice(2);
      return `1. ${line}`;
    }
    if (prefixMap[formatType]) {
      const m = prefixMap[formatType];
      const listMatch = /^(-\s|\d+\.\s|[☐☒☑]\s)/.exec(line);
      const markerLen = listMatch ? listMatch[0].length : 0;
      const prefix = listMatch ? listMatch[0] : '';
      const body = line.slice(markerLen);
      return `${prefix}${m}${body}${m}`;
    }
    return line;
  };

  it('correctly detects open vs checked checkboxes', () => {
    assert.equal(isLineCheckbox('☐ Buy groceries'), true);
    assert.equal(isLineCheckbox('☒ Call accountant'), true);
    assert.equal(isLineCheckbox('☑ Submit report'), true);
    assert.equal(isLineCheckbox('[ ] Prepare slides'), true);
    assert.equal(isLineCheckbox('[x] Done with review'), true);
    assert.equal(isLineCheckbox('- [ ] Markdown item'), true);
    assert.equal(isLineCheckbox('- Regular bullet item'), false);
    assert.equal(isLineCheckbox('1. Numbered item'), false);
    assert.equal(isLineCheckbox('Just plain text'), false);

    assert.equal(isLineChecked('☐ Buy groceries'), false);
    assert.equal(isLineChecked('[ ] Prepare slides'), false);
    assert.equal(isLineChecked('☒ Call accountant'), true);
    assert.equal(isLineChecked('☑ Submit report'), true);
    assert.equal(isLineChecked('[x] Done with review'), true);
    assert.equal(isLineChecked('- [x] Done item'), true);
  });

  it('strips leading checkbox marker to yield clean line body', () => {
    assert.equal(getLineTextWithoutCheckbox('☐ Finalize contract'), 'Finalize contract');
    assert.equal(getLineTextWithoutCheckbox('☒ Reviewed draft'), 'Reviewed draft');
    assert.equal(getLineTextWithoutCheckbox('[ ] Untagged task'), 'Untagged task');
    assert.equal(getLineTextWithoutCheckbox('- [x] Checked markdown'), 'Checked markdown');
    assert.equal(getLineTextWithoutCheckbox('Ordinary line'), 'Ordinary line');
  });

  it('toggles open box to box-with-x and vice-versa', () => {
    const openLine = '☐ Plan Q4 kickoff meeting';
    const checkedLine = toggleLineCheckbox(openLine);
    assert.equal(checkedLine, '☒ Plan Q4 kickoff meeting');

    const toggledBack = toggleLineCheckbox(checkedLine);
    assert.equal(toggledBack, '☐ Plan Q4 kickoff meeting');

    // Also handles checkmark glyph U+2611
    assert.equal(toggleLineCheckbox('☑ Legacy checkmark'), '☐ Legacy checkmark');
  });

  it('auto-expands typed brackets into unicode ballot boxes', () => {
    assert.equal(autoExpandInput('[] My new item'), '☐ My new item');
    assert.equal(autoExpandInput('[ ] My other item'), '☐ My other item');
    assert.equal(autoExpandInput('- [ ] Markdown bullet'), '☐ Markdown bullet');
    assert.equal(autoExpandInput('[x] Completed task'), '☒ Completed task');
    assert.equal(autoExpandInput('- [X] Case-insensitive done'), '☒ Case-insensitive done');
    assert.equal(autoExpandInput('Regular text [bracket] not leading'), 'Regular text [bracket] not leading');
  });

  it('applies checklist toolbar format and cycles states', () => {
    let line = 'Draft marketing memo';
    line = applyFormat(line, 'checklist');
    assert.equal(line, '☐ Draft marketing memo');

    line = applyFormat(line, 'checklist');
    assert.equal(line, '☒ Draft marketing memo');

    line = applyFormat(line, 'checklist');
    assert.equal(line, 'Draft marketing memo');
  });

  it('replaces existing bullet or list number with checklist', () => {
    assert.equal(applyFormat('- Bullet item', 'checklist'), '☐ Bullet item');
    assert.equal(applyFormat('1. Numbered item', 'checklist'), '☐ Numbered item');
  });

  it('formats bold text on checklist line without wrapping checkbox glyph', () => {
    const formatted = applyFormat('☐ Important deadline', 'bold');
    assert.equal(formatted, '☐ **Important deadline**');
  });

  it('clears checklist formatting with format_clear', () => {
    assert.equal(applyFormat('☐ **Important deadline**', 'clear'), 'Important deadline');
    assert.equal(applyFormat('☒ Completed task', 'clear'), 'Completed task');
  });
});
