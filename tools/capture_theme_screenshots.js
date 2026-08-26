/**
 * @file capture_theme_screenshots.js
 * @description Headless Chrome CDP tool to capture semantic screenshots for light and dark themes.
 */

import fs from 'node:fs';

/**
 * Finds an open page target on the local Chrome DevTools Protocol endpoint,
 * opening a fresh one at the daily view if none exists yet.
 * @returns {Promise<string>} The page's `webSocketDebuggerUrl`.
 */
async function getCDPTarget() {
  const res = await fetch('http://127.0.0.1:9222/json/list');
  const targets = await res.json();
  let pageTarget = targets.find(t => t.type === 'page');
  if (!pageTarget) {
    const newTargetRes = await fetch('http://127.0.0.1:9222/json/new?http://localhost:3000/?view=daily');
    pageTarget = await newTargetRes.json();
  }
  return pageTarget.webSocketDebuggerUrl;
}

/**
 * Sends a Chrome DevTools Protocol command over an open WebSocket and resolves
 * with the matching response (correlated by `id`).
 * @param {WebSocket} ws Open CDP WebSocket connection.
 * @param {string} method CDP method name, e.g. 'Page.navigate'.
 * @param {object} [params={}] Method parameters.
 * @param {number} [id=1] Message id used to correlate the response.
 * @returns {Promise<any>} The command's result payload.
 */
function sendCDPCommand(ws, method, params = {}, id = 1) {
  return new Promise((resolve, reject) => {
    const messageHandler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === id) {
        ws.removeEventListener('message', messageHandler);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
    ws.addEventListener('message', messageHandler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

/**
 * Loads the daily view under the given theme, forces the theme attribute/Alpine
 * state to match (belt-and-braces against a stale localStorage read on first
 * paint), and writes a PNG screenshot to `outputFile`.
 * @param {'light'|'dark'} theme Theme to apply before capturing.
 * @param {string} outputFile Absolute path to write the PNG to.
 * @returns {Promise<void>}
 */
async function captureScreen(theme, outputFile) {
  const wsUrl = await getCDPTarget();
  const ws = new WebSocket(wsUrl);

  await new Promise((resolve) => ws.addEventListener('open', resolve));

  let msgId = 1;
  await sendCDPCommand(ws, 'Runtime.enable', {}, msgId++);
  await sendCDPCommand(ws, 'Page.enable', {}, msgId++);
  await sendCDPCommand(ws, 'Network.enable', {}, msgId++);

  // Set Viewport
  await sendCDPCommand(ws, 'Emulation.setDeviceMetricsOverride', {
    width: 1400,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  }, msgId++);

  // First set localStorage theme
  await sendCDPCommand(ws, 'Runtime.evaluate', {
    expression: `
      localStorage.setItem('dayPlannerTheme', '${theme}');
      document.documentElement.setAttribute('data-theme', '${theme}');
    `
  }, msgId++);

  // Navigate to URL with fresh reload
  await sendCDPCommand(ws, 'Page.navigate', { url: 'http://localhost:3000/?view=daily' }, msgId++);

  // Wait 1.5 seconds for full rendering
  await new Promise(r => setTimeout(r, 1500));

  // Ensure theme attribute is present
  await sendCDPCommand(ws, 'Runtime.evaluate', {
    expression: `
      document.documentElement.setAttribute('data-theme', '${theme}');
      if (window.Alpine) {
        const root = document.querySelector('[x-data]');
        if (root && root._x_dataStack && root._x_dataStack[0]) {
          root._x_dataStack[0].theme = '${theme}';
        }
      }
    `
  }, msgId++);

  await new Promise(r => setTimeout(r, 500));

  // Capture screenshot
  const screenshotResult = await sendCDPCommand(ws, 'Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  }, msgId);

  const buffer = Buffer.from(screenshotResult.data, 'base64');
  fs.writeFileSync(outputFile, buffer);
  console.log(`Saved screenshot: ${outputFile} (${theme})`);

  ws.close();
}

/**
 * Captures the light and dark theme reference screenshots of the daily view.
 * @returns {Promise<void>}
 */
async function main() {
  await captureScreen('light', '/home/mike/projects/day-planner/desktop_daily_light.png');
  await new Promise(r => setTimeout(r, 1000));
  await captureScreen('dark', '/home/mike/projects/day-planner/desktop_daily_dark.png');
}

main().catch(err => {
  console.error('Theme screenshot error:', err);
  process.exit(1);
});
