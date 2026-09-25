/**
 * @file tools/open-dev-playwright.js
 * @description Drives Chrome via Playwright over CDP to test Day Planner on the canonical /dev URL.
 */

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  try {
    ({ chromium } = await import('/home/mike/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'));
  } catch {
    console.error('Playwright not found.');
    process.exit(1);
  }
}

const DEV_URL = 'https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev';
const DEV_SELF_TEST_URL = 'https://script.google.com/macros/s/AKfycbwb0hECvMIoJG1OHYBUTRan5_kF-T3PO7bSP-NSvwil/dev?view=self-test';
const CDP_URL = process.env.CDP_URL || 'http://127.0.0.1:9222';

async function main() {
  let browser;
  let context;
  let page;

  console.log('⚡ Playwright /dev Test Driver (Win11 / Git Bash)');

  // 1. Try connecting to existing authenticated Chrome with remote debugging
  try {
    console.log(`Checking for Chrome CDP on ${CDP_URL}...`);
    browser = await chromium.connectOverCDP(CDP_URL, { timeout: 2500 });
    console.log('✅ Connected to existing Chrome instance via CDP!');
    const contexts = browser.contexts();
    context = contexts.length > 0 ? contexts[0] : await browser.newContext();
    const pages = context.pages();
    page = pages.length > 0 ? pages[0] : await context.newPage();
  } catch {
    console.log('ℹ️ No active Chrome CDP found on port 9222.');
    console.log('Launching standard Chrome window...');
    browser = await chromium.launch({
      headless: false,
      channel: 'chrome',
      args: ['--start-maximized']
    });
    context = await browser.newContext({ viewport: null });
    page = await context.newPage();
  }

  try {
    console.log(`\nNavigating to /dev?view=self-test ...`);
    const response = await page.goto(DEV_SELF_TEST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('HTTP Status:', response ? response.status() : 'N/A');
    console.log('Current URL:', page.url());
    console.log('Page Title:', await page.title());

    console.log('Waiting 10s for test execution and report rendering...');
    await page.waitForTimeout(10000);

    const selfTestScreenshot = '/home/mike/projects/day-planner/screen-shots/playwright-dev-selftest.png';
    await page.screenshot({ path: selfTestScreenshot });
    console.log('Saved self-test screenshot:', selfTestScreenshot);
    console.log('Title after wait:', await page.title());

    console.log('\nNavigating to main /dev app ...');
    await page.goto(DEV_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    const appScreenshot = '/home/mike/projects/day-planner/screen-shots/playwright-dev-app.png';
    await page.screenshot({ path: appScreenshot });
    console.log('Saved app screenshot:', appScreenshot);
    console.log('App URL:', page.url());
    console.log('App Title:', await page.title());

  } catch (err) {
    console.error('Execution error:', err.message);
  } finally {
    console.log('\nSession complete.');
    // Only close if we launched our own browser, keep user's CDP browser alive
    if (!process.env.KEEP_OPEN && !browser.isConnected) {
      await browser.close();
    }
  }
}

main();
