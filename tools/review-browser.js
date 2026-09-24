/* global document, localStorage */
import { chromium } from '/home/mike/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

async function reviewLocalApp() {
  console.log('🚀 Launching Playwright browser for review...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  const pageErrors = [];
  page.on('pageerror', err => {
    pageErrors.push(err.message);
  });

  console.log('Navigating to http://localhost:3000 ...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });

  console.log('Page title:', await page.title());

  // Wait for Alpine to initialize
  await page.waitForFunction('typeof window.Alpine !== "undefined"');
  console.log('✔ Alpine initialized');

  const views = [
    { name: 'daily', selector: '.segment-btn:has-text("Today")' },
    { name: 'monthly-calendar', selector: '.segment-btn:has-text("Month")' },
    { name: 'master-tasks', selector: '.segment-btn:has-text("Master Tasks")' },
    { name: 'monthly-index', selector: '.segment-btn:has-text("Index")' },
    { name: 'future-matrix', selector: '.segment-btn:has-text("Future")' },
    { name: 'about', selector: '.segment-btn:has-text("About")' }
  ];

  for (const theme of ['light', 'dark']) {
    console.log(`\n========================================`);
    console.log(`Reviewing in ${theme.toUpperCase()} mode`);
    console.log(`========================================`);

    // Ensure correct theme attribute
    await page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t);
      localStorage.setItem('dayPlannerTheme', t);
    }, theme);
    await page.waitForTimeout(200);

    for (const v of views) {
      console.log(`\n--- Reviewing View: ${v.name} (${theme}) ---`);
      await page.click(v.selector);
      await page.waitForTimeout(400);

      const screenshotPath = `/home/mike/projects/day-planner/screen-shots/review-${v.name}-${theme}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`Saved screenshot to ${screenshotPath}`);

      if (v.name === 'daily') {
        const scheduleVisible = await page.isVisible('.schedule-column');
        const taskRows = await page.$$eval('.task-row', rows => rows.length);
        console.log(`  Daily schedule visible: ${scheduleVisible}, Task rows count: ${taskRows}`);
      } else if (v.name === 'monthly-calendar') {
        const days = await page.$$eval('.calendar-day-cell', cells => cells.length);
        console.log(`  Monthly calendar day cells: ${days}`);
      } else if (v.name === 'master-tasks') {
        const masterRows = await page.$$eval('.master-task-row', rows => rows.length);
        console.log(`  Master task rows count: ${masterRows}`);
      } else if (v.name === 'monthly-index') {
        const tableVisible = await page.isVisible('table.task-table');
        console.log(`  Monthly index table visible: ${tableVisible}`);
      } else if (v.name === 'future-matrix') {
        const monthCards = await page.$$eval('.future-month-card', cards => cards.length);
        console.log(`  Future matrix month cards: ${monthCards}`);
      } else if (v.name === 'about') {
        const aboutVisible = await page.isVisible('.about-container');
        console.log(`  About container visible: ${aboutVisible}`);
      }
    }

    // Test Universal Search (Ctrl+K)
    console.log(`\n--- Testing Search Dialog (Ctrl+K) in ${theme} mode ---`);
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(300);
    const searchModalOpen = await page.isVisible('dialog.modal-backdrop[open]');
    console.log(`  Search modal open: ${searchModalOpen}`);
    if (searchModalOpen) {
      await page.fill('.search-input-field', 'Meeting');
      await page.waitForTimeout(300);
      const searchResults = await page.$$eval('.search-result-item', items => items.length);
      console.log(`  Search results for "Meeting": ${searchResults}`);
      await page.screenshot({ path: `/home/mike/projects/day-planner/screen-shots/review-search-${theme}.png` });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  }

  // Check errors
  console.log('\n--- Summary of Review ---');
  console.log('Console errors:', consoleErrors.length);
  if (consoleErrors.length > 0) {
    consoleErrors.forEach(e => console.log('  ❌ Console Error:', e));
  }
  console.log('Page errors:', pageErrors.length);
  if (pageErrors.length > 0) {
    pageErrors.forEach(e => console.log('  ❌ Page Error:', e));
  }

  await browser.close();
  console.log('\n✔ Playwright review completed successfully');
}

reviewLocalApp().catch(err => {
  console.error('Review script failed:', err);
  process.exit(1);
});
