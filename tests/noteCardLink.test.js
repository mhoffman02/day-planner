import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GASBridge } from '../src/gasBridge.js';

describe('Note Card Hyperlink & Drive Title Resolution', () => {
  const isGoogleDriveDocUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    const isGoogle = /^https:\/\/(?:docs|drive)\.google\.com\//i.test(trimmed);
    if (!isGoogle) return false;
    return /\/d\/[a-zA-Z0-9_-]+/i.test(trimmed)
      || /[?&]id=[a-zA-Z0-9_-]+/i.test(trimmed)
      || /\/folders\/[a-zA-Z0-9_-]+/i.test(trimmed);
  };

  const normalizeLinkUrl = (url) => {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (/^(https?|mailto):/i.test(trimmed)) return trimmed;
    if (/^[\w.-]+\.[a-z]{2,}/i.test(trimmed)) return `https://${trimmed}`;
    return '';
  };

  it('correctly identifies valid Google Drive / Docs / Sheets / Slides / Forms / Folder URLs', () => {
    assert.equal(isGoogleDriveDocUrl('https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit'), true);
    assert.equal(isGoogleDriveDocUrl('https://docs.google.com/document/u/0/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit'), true);
    assert.equal(isGoogleDriveDocUrl('https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0'), true);
    assert.equal(isGoogleDriveDocUrl('https://docs.google.com/presentation/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit'), true);
    assert.equal(isGoogleDriveDocUrl('https://docs.google.com/forms/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit'), true);
    assert.equal(isGoogleDriveDocUrl('https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/view'), true);
    assert.equal(isGoogleDriveDocUrl('https://drive.google.com/open?id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'), true);
    assert.equal(isGoogleDriveDocUrl('https://drive.google.com/drive/folders/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'), true);
  });

  it('rejects non-Google Drive URLs', () => {
    assert.equal(isGoogleDriveDocUrl('https://github.com/mhoffman02/day-planner'), false);
    assert.equal(isGoogleDriveDocUrl('https://example.com/test/d/12345'), false);
    assert.equal(isGoogleDriveDocUrl('https://google.com/search?q=dayplanner'), false);
    assert.equal(isGoogleDriveDocUrl(''), false);
    assert.equal(isGoogleDriveDocUrl(null), false);
  });

  it('normalizes link URLs with and without protocols', () => {
    assert.equal(normalizeLinkUrl('https://docs.google.com/document/d/12345'), 'https://docs.google.com/document/d/12345');
    assert.equal(normalizeLinkUrl('http://example.com'), 'http://example.com');
    assert.equal(normalizeLinkUrl('mailto:user@example.com'), 'mailto:user@example.com');
    assert.equal(normalizeLinkUrl('docs.google.com/document/d/12345'), 'https://docs.google.com/document/d/12345');
    assert.equal(normalizeLinkUrl('   https://example.com   '), 'https://example.com');
    assert.equal(normalizeLinkUrl('not-a-valid-url'), '');
  });

  it('simulates link modal insertion into note line at specific selection', async () => {
    const bridge = new GASBridge(true);
    const driveUrl = 'https://docs.google.com/document/d/doc12345/edit';

    // Lookup title
    const res = await bridge.resolveLinkTitle(driveUrl);
    assert.ok(res.success);
    assert.equal(res.title, 'Executive Briefing Doc');

    // Simulate modal submit with selection range
    const originalLine = 'Review the draft before the meeting.';
    const selStart = 11;
    const selEnd = 16; // 'draft'
    const displayText = res.title;
    const wrapped = `[[link:${driveUrl}]]${displayText}[[/link]]`;

    const before = originalLine.slice(0, selStart);
    const after = originalLine.slice(selEnd);
    const resultLine = before + wrapped + after;

    assert.equal(resultLine, `Review the [[link:${driveUrl}]]Executive Briefing Doc[[/link]] before the meeting.`);
  });

  it('simulates link modal insertion appending to line when no selection exists', async () => {
    const bridge = new GASBridge(true);
    const sheetUrl = 'https://docs.google.com/spreadsheets/d/sheet67890/edit';

    const res = await bridge.resolveLinkTitle(sheetUrl);
    assert.ok(res.success);
    assert.equal(res.title, 'Financial Planning Spreadsheet');

    const originalLine = '- Discuss Q3 budget items:';
    const wrapped = `[[link:${sheetUrl}]]${res.title}[[/link]]`;
    const resultLine = `${originalLine} ${wrapped}`;

    assert.equal(resultLine, `- Discuss Q3 budget items: [[link:${sheetUrl}]]Financial Planning Spreadsheet[[/link]]`);
  });

  it('correctly provides fallback link text when title is not available', () => {
    const getDefaultLinkText = (url) => {
      if (!url || typeof url !== 'string') return 'Link';
      const trimmed = url.trim();
      if (/document/i.test(trimmed)) return 'Google Doc';
      if (/spreadsheets/i.test(trimmed)) return 'Google Sheet';
      if (/presentation/i.test(trimmed)) return 'Google Slide Deck';
      if (/forms/i.test(trimmed)) return 'Google Form';
      if (/folders/i.test(trimmed)) return 'Drive Folder';
      if (/drive\.google\.com/i.test(trimmed)) return 'Google Drive File';
      try {
        const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
        return parsed.hostname.replace(/^www\./, '');
      } catch (_err) {
        return trimmed;
      }
    };

    assert.equal(getDefaultLinkText('https://docs.google.com/document/d/123/edit'), 'Google Doc');
    assert.equal(getDefaultLinkText('https://docs.google.com/spreadsheets/d/456/edit'), 'Google Sheet');
    assert.equal(getDefaultLinkText('https://docs.google.com/presentation/d/789/edit'), 'Google Slide Deck');
    assert.equal(getDefaultLinkText('https://drive.google.com/drive/folders/folder999'), 'Drive Folder');
    assert.equal(getDefaultLinkText('https://github.com/mhoffman02/day-planner'), 'github.com');
  });

  it('renders standard markdown links, autolinks, custom bracket links, and raw URLs', () => {
    const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const renderInline = (line) => {
      let html = escapeHtml(line);
      html = html.replace(/\[\[link:((?:https?|mailto):[^\]\s]+)\]\](.*?)\[\[\/link\]\]/g, (_m, url, linkText) => {
        const safeHrefUrl = url.replace(/"/g, '&quot;');
        const label = (linkText || '').trim() || url;
        return `<a href="${safeHrefUrl}" target="_blank" rel="noopener noreferrer" class="note-render-link">${label}</a>`;
      });
      html = html.replace(/\[([^\]]+)\]\(((?:https?|mailto):[^)\s]+)\)/g, (_m, linkText, url) => {
        const safeHrefUrl = url.replace(/"/g, '&quot;');
        return `<a href="${safeHrefUrl}" target="_blank" rel="noopener noreferrer" class="note-render-link">${linkText}</a>`;
      });
      html = html.replace(/&lt;((?:https?|mailto):[^&>\s]+)&gt;/g, (_m, url) => {
        const safeHrefUrl = url.replace(/"/g, '&quot;');
        return `<a href="${safeHrefUrl}" target="_blank" rel="noopener noreferrer" class="note-render-link">${url}</a>`;
      });
      html = html.replace(/(^|[\s(])((?:https?):\/\/[^\s<)]+)/g, (_m, prefix, url) => {
        const safeHrefUrl = url.replace(/"/g, '&quot;');
        return `${prefix}<a href="${safeHrefUrl}" target="_blank" rel="noopener noreferrer" class="note-render-link">${url}</a>`;
      });
      return html;
    };

    // Standard markdown
    assert.equal(
      renderInline('Review [Architecture Doc](https://docs.google.com/doc1) before Friday.'),
      'Review <a href="https://docs.google.com/doc1" target="_blank" rel="noopener noreferrer" class="note-render-link">Architecture Doc</a> before Friday.'
    );

    // Markdown link with same url as text
    assert.equal(
      renderInline('Review [https://docs.google.com/doc1](https://docs.google.com/doc1) now.'),
      'Review <a href="https://docs.google.com/doc1" target="_blank" rel="noopener noreferrer" class="note-render-link">https://docs.google.com/doc1</a> now.'
    );

    // Custom bracket link
    assert.equal(
      renderInline('Open [[link:https://drive.google.com/file1]]Google Doc[[/link]] in browser.'),
      'Open <a href="https://drive.google.com/file1" target="_blank" rel="noopener noreferrer" class="note-render-link">Google Doc</a> in browser.'
    );

    // Custom bracket link with empty text
    assert.equal(
      renderInline('Open [[link:https://drive.google.com/file1]][[/link]] in browser.'),
      'Open <a href="https://drive.google.com/file1" target="_blank" rel="noopener noreferrer" class="note-render-link">https://drive.google.com/file1</a> in browser.'
    );

    // Autolink <url>
    assert.equal(
      renderInline('Source: <https://github.com/project>'),
      'Source: <a href="https://github.com/project" target="_blank" rel="noopener noreferrer" class="note-render-link">https://github.com/project</a>'
    );
  });
});
