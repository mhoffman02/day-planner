/**
 * @file accessibility.test.js
 * @description Unit tests for automated accessibility verification, WCAG 2.1 Level AA color contrast,
 * and ARIA semantics.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseHex,
  getRelativeLuminance,
  getContrastRatio,
  extractThemeTokens,
  auditColorContrast,
  auditAriaSemantics,
  runAccessibilityAudit
} from '../tools/check-accessibility.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

describe('Accessibility & WCAG 2.1 AA Verification Tests', () => {
  describe('WCAG Color Contrast Mathematics', () => {
    it('should parse 3-digit, 6-digit, and 8-digit hex colors', () => {
      assert.deepEqual(parseHex('#fff'), [255, 255, 255, 1]);
      assert.deepEqual(parseHex('#000000'), [0, 0, 0, 1]);
      assert.deepEqual(parseHex('#23594b'), [35, 89, 75, 1]);
      assert.equal(parseHex('invalid'), null);
    });

    it('should calculate accurate relative luminance according to WCAG 2.1 standard', () => {
      const whiteLum = getRelativeLuminance([255, 255, 255]);
      const blackLum = getRelativeLuminance([0, 0, 0]);
      assert.equal(Number(whiteLum.toFixed(4)), 1);
      assert.equal(Number(blackLum.toFixed(4)), 0);
    });

    it('should calculate contrast ratios correctly (21:1 for black on white, 1:1 for identical)', () => {
      const maxRatio = getContrastRatio('#000000', '#ffffff');
      const minRatio = getContrastRatio('#ffffff', '#ffffff');
      assert.equal(Number(maxRatio.toFixed(1)), 21.0);
      assert.equal(Number(minRatio.toFixed(1)), 1.0);
    });
  });

  describe('Theme Design System Contrast Audit', () => {
    const cssPath = path.join(ROOT, 'src', 'styles.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    it('should extract light and dark mode tokens from styles.css', () => {
      const tokens = extractThemeTokens(cssContent);
      assert.ok(tokens.light['--theme-panel-bg']);
      assert.ok(tokens.dark['--theme-panel-bg']);
      assert.ok(tokens.light['--theme-header-bg']);
      assert.ok(tokens.dark['--theme-header-bg']);
    });

    it('should pass WCAG 2.1 AA contrast requirements (>= 4.5:1) for all theme token pairs', () => {
      const results = auditColorContrast(cssContent);
      assert.ok(results.length >= 20);

      const failures = results.filter(r => !r.pass);
      assert.deepEqual(
        failures.map(f => `${f.theme.toUpperCase()} ${f.name}: ${f.ratio}:1 < ${f.minRequired}:1`),
        [],
        'All color pairs must satisfy WCAG 2.1 AA minimum contrast'
      );
    });
  });

  describe('index.html ARIA Semantics & Keyboard Accessibility Audit', () => {
    const htmlPath = path.join(ROOT, 'index.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');

    it('should have zero ARIA, labeling, or keyboard accessibility violations in index.html', () => {
      const issues = auditAriaSemantics(htmlContent);
      assert.deepEqual(
        issues.map(i => `[${i.rule}] ${i.error}`),
        [],
        'index.html should have 0 accessibility violations'
      );
    });

    it('runAccessibilityAudit() should complete cleanly with 0 total issues', () => {
      const summary = runAccessibilityAudit();
      assert.equal(summary.contrastPassed, true);
      assert.equal(summary.ariaPassed, true);
      assert.equal(summary.totalIssues, 0);
    });
  });
});
