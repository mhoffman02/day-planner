/**
 * @file tools/e2e/cdp-client.js
 * @description Minimal Chrome DevTools Protocol client over the raw WebSocket endpoint —
 * no Puppeteer/Playwright. Attaches to a Chrome already running with a debug port (see
 * tools/ensure-chrome.js) rather than launching its own, so it never sets the automation
 * flags (`--enable-automation`, `navigator.webdriver`) that Google's sign-in flow blocks on.
 */

/**
 * Connects to a page target on a local CDP endpoint and returns a small driver.
 * @param {object} [opts]
 * @param {number} [opts.port=9222] CDP debug port.
 * @param {string} [opts.urlContains] If set, picks the first open target whose URL contains this
 *   substring instead of the first matching target found.
 * @param {string} [opts.type='page'] CDP target type to match — 'page' for a top-level tab, or
 *   'iframe' to reach into a same-tab child frame that Chrome exposes as its own target (this is
 *   how Google Apps Script's `HtmlService` output shows up: the outer `script.google.com` tab is
 *   just a wrapper — the actual app renders inside a `*.googleusercontent.com` iframe target).
 * @returns {Promise<object>} Driver with navigate/evaluate/screenshot/getConsoleErrors/close.
 */
async function connectCdp({ port = 9222, urlContains, type = 'page' } = {}) {
  const res = await fetch(`http://localhost:${port}/json/list`);
  if (!res.ok) throw new Error(`CDP endpoint not reachable on port ${port} (HTTP ${res.status}) — run tools/ensure-chrome.js first.`);
  const targets = await res.json();
  const pageTarget = urlContains
    ? targets.find((t) => t.type === type && t.url && t.url.includes(urlContains))
    : targets.find((t) => t.type === type);
  if (!pageTarget) throw new Error(`No matching CDP ${type} target found${urlContains ? ` (looking for URL containing "${urlContains}")` : ''}.`);

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let msgId = 1;
  const pending = new Map();
  const consoleMessages = [];

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      consoleMessages.push({
        type: msg.params.type,
        text: msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '),
      });
    } else if (msg.method === 'Runtime.exceptionThrown') {
      consoleMessages.push({
        type: 'error',
        text: msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description || ''),
      });
    }
  });

  function send(method, params = {}) {
    const id = msgId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Runtime.enable');
  await send('Page.enable');

  return {
    /** Raw target metadata (url, title, id) from /json/list at connect time. */
    target: pageTarget,
    /** Send an arbitrary CDP command. */
    send,
    /** Navigate the page and wait `settleMs` for it to render. */
    async navigate(url, settleMs = 1500) {
      await send('Page.navigate', { url });
      await new Promise((r) => setTimeout(r, settleMs));
    },
    /** Evaluate a JS expression in the page and return its value. */
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    },
    /** Capture a PNG screenshot to `outputFile`. */
    async screenshot(outputFile, { width = 1400, height = 900 } = {}) {
      const fs = await import('node:fs');
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(outputFile, Buffer.from(data, 'base64'));
      return outputFile;
    },
    /** Console messages (console.* calls + uncaught exceptions) collected since connecting. */
    getConsoleMessages() {
      return consoleMessages.slice();
    },
    /** Close the WebSocket (does not close the browser). */
    close() {
      ws.close();
    },
  };
}

export { connectCdp };
