/**
 * @file capture_screenshots.js
 * @description Auto-generated JSDoc header for capture_screenshots.js.
 */

import fs from 'node:fs';
import http from 'node:http';

async function getCDPTarget() {
  const res = await fetch('http://127.0.0.1:9222/json/list');
  const targets = await res.json();
  const pageTarget = targets.find(t => t.type === 'page');
  if (!pageTarget) throw new Error('No page target found');
  return pageTarget.webSocketDebuggerUrl;
}

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

async function captureScreen(url, width, height, outputFile) {
  const wsUrl = await getCDPTarget();
  const ws = new WebSocket(wsUrl);

  await new Promise((resolve) => ws.addEventListener('open', resolve));

  let msgId = 1;
  await sendCDPCommand(ws, 'Runtime.enable', {}, msgId++);
  await sendCDPCommand(ws, 'Page.enable', {}, msgId++);
  await sendCDPCommand(ws, 'Network.enable', {}, msgId++);
  await sendCDPCommand(ws, 'Network.clearBrowserCache', {}, msgId++);

  ws.addEventListener('message', (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      console.log('[BROWSER CONSOLE]', msg.params.type, msg.params.args.map(a => a.value || a.description).join(' '));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      console.error('[BROWSER ERROR]', msg.params.exceptionDetails.text, msg.params.exceptionDetails.exception?.description);
    }
  });

  // Set Viewport
  await sendCDPCommand(ws, 'Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768
  }, msgId++);

  // Navigate to URL
  await sendCDPCommand(ws, 'Page.navigate', { url }, msgId++);

  // Wait 1.5 seconds for rendering/Alpine JS execution
  await new Promise(r => setTimeout(r, 1500));

  // Capture screenshot
  const screenshotResult = await sendCDPCommand(ws, 'Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  }, msgId++);

  const buffer = Buffer.from(screenshotResult.data, 'base64');
  fs.writeFileSync(outputFile, buffer);
  console.log(`Saved screenshot: ${outputFile} (${width}x${height})`);

  ws.close();
}

async function main() {
  const screenshots = [
    { url: 'http://localhost:3000/?view=daily', width: 1400, height: 900, file: '/home/mike/projects/day-planner/ui_review_1.png' },
    { url: 'http://localhost:3000/?view=daily', width: 414, height: 896, file: '/home/mike/projects/day-planner/ui_review_mobile.png' },
    { url: 'http://localhost:3000/?view=daily', width: 1400, height: 900, file: '/home/mike/projects/day-planner/desktop_daily.png' },
    { url: 'http://localhost:3000/?view=daily', width: 414, height: 896, file: '/home/mike/projects/day-planner/mobile_daily.png' },
    { url: 'http://localhost:3000/?view=monthly', width: 1400, height: 900, file: '/home/mike/projects/day-planner/desktop_monthly.png' },
    { url: 'http://localhost:3000/?view=tasks', width: 1400, height: 900, file: '/home/mike/projects/day-planner/desktop_tasks.png' }
  ];

  for (const s of screenshots) {
    await captureScreen(s.url, s.width, s.height, s.file);
  }
}

main().catch(err => {
  console.error('Screenshot script error:', err);
  process.exit(1);
});
