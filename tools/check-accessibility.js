#!/usr/bin/env node
/**
 * @file tools/check-accessibility.js
 * @description Automated accessibility linter verifying WCAG 2.1 Level AA color contrast ratios
 * across light and dark theme tokens, plus ARIA semantics and keyboard accessibility on index.html.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── WCAG Color Math ─────────────────────────────────────────────────────────

/**
 * Converts a hex color (#rgb, #rgba, #rrggbb, #rrggbbaa) to [r, g, b, a] in 0-255 / 0-1.
 * @param {string} hex
 * @returns {[number, number, number, number]|null}
 */
export function parseHex(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const h = hex.trim().replace(/^#/, '');
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
      1
    ];
  }
  if (h.length === 6) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      1
    ];
  }
  if (h.length === 8) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      parseInt(h.slice(6, 8), 16) / 255
    ];
  }
  return null;
}

/**
 * Calculates WCAG relative luminance for an [r, g, b] color (0-255).
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 * @param {[number, number, number]} rgb
 * @returns {number}
 */
export function getRelativeLuminance(rgb) {
  const [rs, gs, bs] = rgb.map(val => {
    const s = val / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculates WCAG contrast ratio between two colors (hex strings).
 * @param {string} hex1 Foreground or background
 * @param {string} hex2 Foreground or background
 * @returns {number} Contrast ratio e.g. 4.5
 */
export function getContrastRatio(hex1, hex2) {
  const c1 = parseHex(hex1);
  const c2 = parseHex(hex2);
  if (!c1 || !c2) return 0;
  const l1 = getRelativeLuminance(c1);
  const l2 = getRelativeLuminance(c2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ── CSS Token Parser ────────────────────────────────────────────────────────

/**
 * Extracts CSS variables defined in :root / [data-theme="..."] blocks from styles.css.
 * @param {string} cssContent
 * @returns {{light: Object<string, string>, dark: Object<string, string>}}
 */
export function extractThemeTokens(cssContent) {
  const light = {};
  const dark = {};

  const lightMatch = cssContent.match(/:(?:root|root\[data-theme="light"\])[\s\S]*?\{([\s\S]*?)\}/);
  if (lightMatch) {
    const varLines = lightMatch[1].matchAll(/--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g);
    for (const [, name, val] of varLines) {
      light[`--${name}`] = val.trim();
    }
  }

  const darkMatch = cssContent.match(/\[data-theme="dark"\][\s\S]*?\{([\s\S]*?)\}/);
  if (darkMatch) {
    const varLines = darkMatch[1].matchAll(/--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g);
    for (const [, name, val] of varLines) {
      dark[`--${name}`] = val.trim();
    }
  }

  // Resolve indirect variable references (e.g. var(--other))
  const resolveToken = (tokens, val) => {
    let resolved = val;
    let iterations = 0;
    while (resolved && resolved.startsWith('var(') && iterations < 5) {
      const varName = resolved.replace(/^var\(\s*/, '').replace(/\s*\)$/, '');
      resolved = tokens[varName] || null;
      iterations++;
    }
    return resolved;
  };

  for (const k of Object.keys(light)) light[k] = resolveToken(light, light[k]) || light[k];
  for (const k of Object.keys(dark)) dark[k] = resolveToken(dark, dark[k]) || dark[k];

  return { light, dark };
}

// ── WCAG Theme Contrast Audit ───────────────────────────────────────────────

/**
 * Checks color contrast pairs against WCAG AA standards.
 * @param {string} cssContent
 * @returns {Array<{name: string, theme: string, ratio: number, minRequired: number, pass: boolean, fg: string, bg: string}>}
 */
export function auditColorContrast(cssContent) {
  const { light, dark } = extractThemeTokens(cssContent);
  const results = [];

  const pairsToAudit = [
    { name: 'Header Text on Header BG', fg: '--theme-header-fg', bg: '--theme-header-bg', min: 4.5 },
    { name: 'Primary Text on Panel BG', fg: '--theme-text-primary', bg: '--theme-panel-bg', min: 4.5 },
    { name: 'Muted Text on Panel BG', fg: '--theme-text-muted', bg: '--theme-panel-bg', min: 4.5 },
    { name: 'Input Text on Input BG', fg: '--theme-input-fg', bg: '--theme-input-bg', min: 4.5 },
    { name: 'Input Placeholder on Input BG', fg: '--theme-input-placeholder', bg: '--theme-input-bg', min: 3.0 },
    { name: 'Table Row Text on Row BG', fg: '--theme-table-fg', bg: '--theme-table-row-bg', min: 4.5 },
    { name: 'Table Header Text on Table Header BG', fg: '--theme-table-header-fg', bg: '--theme-table-header-bg', min: 4.5 },
    { name: 'Time Column Text on Time Col BG', fg: '--theme-time-col-fg', bg: '--theme-time-col-bg', min: 4.5 },
    { name: 'Pill Text on Pill BG', fg: '--theme-pill-fg', bg: '--theme-pill-bg', min: 4.5 },
    { name: 'Card Header Text on Card Header BG', fg: '--theme-card-header-fg', bg: '--theme-card-header-bg', min: 4.5 },
    { name: 'Card Textarea Text on Textarea BG', fg: '--theme-card-textarea-fg', bg: '--theme-card-textarea-bg', min: 4.5 },
    { name: 'Calendar Text on Calendar Cell BG', fg: '--theme-calendar-fg', bg: '--theme-calendar-cell-bg', min: 4.5 },
    { name: 'Modal Text on Modal BG', fg: '--theme-modal-fg', bg: '--theme-modal-bg', min: 4.5 },
    { name: 'Modal Header on Modal BG', fg: '--theme-modal-header-fg', bg: '--theme-modal-bg', min: 4.5 }
  ];

  for (const pair of pairsToAudit) {
    // Light mode
    const lightFg = light[pair.fg];
    const lightBg = light[pair.bg];
    if (lightFg && lightBg && lightFg.startsWith('#') && lightBg.startsWith('#')) {
      const ratio = Number(getContrastRatio(lightFg, lightBg).toFixed(2));
      results.push({
        name: pair.name,
        theme: 'light',
        fg: lightFg,
        bg: lightBg,
        ratio,
        minRequired: pair.min,
        pass: ratio >= pair.min
      });
    }

    // Dark mode
    const darkFg = dark[pair.fg];
    const darkBg = dark[pair.bg];
    if (darkFg && darkBg && darkFg.startsWith('#') && darkBg.startsWith('#')) {
      const ratio = Number(getContrastRatio(darkFg, darkBg).toFixed(2));
      results.push({
        name: pair.name,
        theme: 'dark',
        fg: darkFg,
        bg: darkBg,
        ratio,
        minRequired: pair.min,
        pass: ratio >= pair.min
      });
    }
  }

  return results;
}

// ── HTML & ARIA Semantics Audit ─────────────────────────────────────────────

/**
 * Audits index.html for ARIA semantics, form labeling, and keyboard accessibility.
 * @param {string} htmlContent
 * @returns {Array<{rule: string, element: string, error: string, pass: boolean}>}
 */
export function auditAriaSemantics(htmlContent) {
  const issues = [];

  // 1. Inputs/Selects/Textareas must have accessible labeling (aria-label, title, or id)
  const inputMatches = htmlContent.matchAll(/<(input|select|textarea)([^>]*?)>/gi);
  for (const match of inputMatches) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];

    // Hidden inputs are exempt
    if (attrs.includes('type="hidden"')) continue;

    const hasAriaLabel = /:?aria-label\s*=\s*(?:"[^"]+"|'[^']+')/i.test(attrs);
    const hasAriaLabelledBy = /:?aria-labelledby\s*=\s*(?:"[^"]+"|'[^']+')/i.test(attrs);
    const hasTitle = /:?title\s*=\s*(?:"[^"]+"|'[^']+')/i.test(attrs);
    const hasId = /:?id\s*=\s*(?:"[^"]+"|'[^']+')/i.test(attrs);

    if (!hasAriaLabel && !hasAriaLabelledBy && !hasTitle && !hasId) {
      issues.push({
        rule: 'form-control-has-label',
        element: `<${tag}${attrs.slice(0, 50)}...>`,
        error: `Interactive form element <${tag}> is missing aria-label, aria-labelledby, title, or id.`,
        pass: false
      });
    }
  }

  // 2. Buttons must have accessible text or aria-label or title
  const buttonMatches = htmlContent.matchAll(/<button([^>]*?)>([\s\S]*?)<\/button>/gi);
  for (const match of buttonMatches) {
    const attrs = match[1];
    const inner = match[2].replace(/<[^>]+>/g, '').trim();

    const hasAriaLabel = /aria-label\s*=\s*['"][^'"]+['"]/i.test(attrs) || /:aria-label\s*=\s*['"][^'"]+['"]/i.test(attrs);
    const hasTitle = /title\s*=\s*['"][^'"]+['"]/i.test(attrs) || /:title\s*=\s*['"][^'"]+['"]/i.test(attrs);
    const hasText = inner.length > 0;
    const hasXText = /x-text\s*=\s*['"][^'"]+['"]/i.test(attrs) || /x-text\s*=\s*['"][^'"]+['"]/i.test(match[2]);

    if (!hasAriaLabel && !hasTitle && !hasText && !hasXText) {
      issues.push({
        rule: 'button-has-accessible-name',
        element: `<button${attrs.slice(0, 50)}...>`,
        error: 'Button element has no accessible text, aria-label, x-text, or title.',
        pass: false
      });
    }
  }

  // 3. Elements with role="button" must have tabindex and keyboard listener
  const roleButtonMatches = htmlContent.matchAll(/<([a-z0-9]+)[^>]*?role\s*=\s*['"]button['"][^>]*?>/gi);
  for (const match of roleButtonMatches) {
    const fullTag = match[0];
    const tag = match[1].toLowerCase();
    if (tag === 'button') continue; // Native buttons already handle keyboard & focus

    const hasTabindex = /tabindex\s*=\s*['"]-?\d+['"]/i.test(fullTag);
    const hasKeydown = /@keydown|@keyup|onkeydown|onkeyup/i.test(fullTag);
    const hasAriaLabel = /aria-label\s*=\s*['"][^'"]+['"]/i.test(fullTag) || /:aria-label/i.test(fullTag);

    if (!hasTabindex) {
      issues.push({
        rule: 'role-button-has-tabindex',
        element: fullTag.slice(0, 60),
        error: `Custom role="button" on <${tag}> lacks tabindex="0" for keyboard focusability.`,
        pass: false
      });
    }
    if (!hasKeydown) {
      issues.push({
        rule: 'role-button-has-keyboard-handler',
        element: fullTag.slice(0, 60),
        error: `Custom role="button" on <${tag}> lacks keydown handler (@keydown.enter / space).`,
        pass: false
      });
    }
    if (!hasAriaLabel) {
      issues.push({
        rule: 'role-button-has-accessible-name',
        element: fullTag.slice(0, 60),
        error: `Custom role="button" on <${tag}> lacks an accessible label (:aria-label or aria-label).`,
        pass: false
      });
    }
  }

  // 4. Modal dialogs must have proper ARIA role and labeling
  const dialogMatches = htmlContent.matchAll(/<(dialog|div)[^>]*?class\s*=\s*['"][^'"]*(?:modal|dialog)[^'"]*['"][^>]*?>/gi);
  for (const match of dialogMatches) {
    const fullTag = match[0];
    const tag = match[1].toLowerCase();
    if (tag === 'dialog') continue; // Native dialog element has built-in semantics

    // If it's a modal-dialog container
    if (/class\s*=\s*['"][^'"]*modal-dialog[^'"]*['"]/i.test(fullTag)) {
      const hasRole = /role\s*=\s*['"]dialog['"]/i.test(fullTag);
      const hasAriaModal = /aria-modal\s*=\s*['"]true['"]/i.test(fullTag);
      if (!hasRole || !hasAriaModal) {
        issues.push({
          rule: 'modal-has-dialog-role',
          element: fullTag.slice(0, 60),
          error: 'Modal container lacks role="dialog" or aria-modal="true".',
          pass: false
        });
      }
    }
  }

  return issues;
}

// ── Runner / CLI ────────────────────────────────────────────────────────────

/**
 * Runs the full accessibility audit on CSS and HTML.
 * @returns {{contrastPassed: boolean, ariaPassed: boolean, totalIssues: number}}
 */
export function runAccessibilityAudit() {
  const cssPath = path.join(ROOT, 'src', 'styles.css');
  const htmlPath = path.join(ROOT, 'index.html');

  const cssContent = fs.readFileSync(cssPath, 'utf8');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  console.log('♿ Running Automated Accessibility (WCAG 2.1 AA & ARIA) Audit...\n');

  // Audit Contrast
  const contrastResults = auditColorContrast(cssContent);
  let contrastFailed = 0;
  console.log('── WCAG 2.1 Level AA Color Contrast Check ──');
  for (const r of contrastResults) {
    const status = r.pass ? '✅' : '❌';
    if (!r.pass) contrastFailed++;
    console.log(`  ${status} [${r.theme.toUpperCase()}] ${r.name}: ${r.ratio}:1 (required: ${r.minRequired}:1) [fg: ${r.fg}, bg: ${r.bg}]`);
  }

  // Audit ARIA Semantics
  const ariaIssues = auditAriaSemantics(htmlContent);
  console.log('\n── ARIA Semantics & Keyboard Accessibility Check ──');
  if (ariaIssues.length === 0) {
    console.log('  ✅ All form controls, interactive buttons, and custom button roles pass accessibility checks.');
  } else {
    for (const issue of ariaIssues) {
      console.error(`  ❌ [${issue.rule}] ${issue.error}\n     Snippet: ${issue.element}`);
    }
  }

  const totalIssues = contrastFailed + ariaIssues.length;
  console.log(`\nAccessibility Audit Summary: ${totalIssues === 0 ? 'ALL PASSED ✅' : `${totalIssues} ISSUE(S) FOUND ❌`}`);

  return {
    contrastPassed: contrastFailed === 0,
    ariaPassed: ariaIssues.length === 0,
    totalIssues
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { totalIssues } = runAccessibilityAudit();
  process.exit(totalIssues === 0 ? 0 : 1);
}
