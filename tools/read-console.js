#!/usr/bin/env node
/**
 * @file tools/read-console.js
 * @description Attaches to Chrome via CDP (port 9222 or custom) to stream console logs,
 * warnings, errors, and uncaught exceptions from active Day Planner tabs.
 *
 * Usage:
 *   node tools/read-console.js              # Listen for 10 seconds and print console logs
 *   node tools/read-console.js --tail 30    # Listen for 30 seconds
 *   node tools/read-console.js --port 9222  # Custom CDP port
 *   node tools/read-console.js --tab Gmail  # Target tab matching name
 */

const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const port = portIdx !== -1 ? args[portIdx + 1] : (process.env.CDP_PORT || '9222');
const tailIdx = args.indexOf('--tail');
const durationSec = tailIdx !== -1 ? parseInt(args[tailIdx + 1], 10) : 10;
const tabFilterIdx = args.indexOf('--tab');
const tabFilter = tabFilterIdx !== -1 ? args[tabFilterIdx + 1] : null;

async function run() {
  try {
    const tabsRes = await fetch(`http://127.0.0.1:${port}/json`);
    if (!tabsRes.ok) {
      console.error(`❌ Chrome not responding on http://127.0.0.1:${port}`);
      process.exit(1);
    }

    const tabs = await tabsRes.json();
    let page;
    if (tabFilter) {
      page = tabs.find(t => t.type === 'page' && (t.title.includes(tabFilter) || t.url.includes(tabFilter)));
    } else {
      page = tabs.find(t => t.type === 'page' && (
        t.title === 'Day Planner' ||
        t.url.includes('script.google.com') ||
        t.url.includes('localhost:3000')
      )) || tabs.find(t => t.type === 'page');
    }

    if (!page) {
      console.log(`⚠️ No active tab found on port ${port}. Open tabs:`);
      tabs.filter(t => t.type === 'page').forEach(t => console.log(`  - [${t.title}] ${t.url}`));
      process.exit(0);
    }

    console.log(`📡 Attached to tab: "${page.title}" (${page.url})`);
    console.log(`⏳ Listening to console for ${durationSec}s...\n`);

    const verRes = await fetch(`http://127.0.0.1:${port}/json/version`);
    const ver = await verRes.json();
    const ws = new WebSocket(ver.webSocketDebuggerUrl);

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    let sessionId = null;
    let logCount = 0;

    const handleTargetEvent = (method, params) => {
      if (method === 'Runtime.consoleAPICalled') {
        logCount++;
        const type = (params.type || 'log').toUpperCase();
        const timestamp = new Date(params.timestamp || Date.now()).toLocaleTimeString();
        const text = (params.args || []).map(a => {
          if (a.value !== undefined) {
            return typeof a.value === 'object' ? JSON.stringify(a.value) : String(a.value);
          }
          return a.description || '';
        }).join(' ');

        const icon = type === 'ERROR' ? '❌' : type === 'WARNING' || type === 'WARN' ? '⚠️' : 'ℹ️';
        console.log(`${icon} [${timestamp}] [console.${params.type}]: ${text}`);
      } else if (method === 'Runtime.exceptionThrown') {
        logCount++;
        const exc = params.exceptionDetails;
        const text = exc.exception?.description || exc.text;
        console.log(`💥 [Uncaught Exception]: ${text} (${exc.url || 'eval'}:${exc.lineNumber})`);
      } else if (method === 'Log.entryAdded') {
        const entry = params.entry;
        if (entry.level === 'error' || entry.level === 'warning') {
          logCount++;
          console.log(`📋 [Browser ${entry.level.toUpperCase()}]: ${entry.text}`);
        }
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.method === 'Target.receivedMessageFromTarget') {
          const inner = JSON.parse(msg.params.message);
          if (inner.method) {
            handleTargetEvent(inner.method, inner.params);
          }
        } else if (msg.method) {
          handleTargetEvent(msg.method, msg.params);
        }
      } catch (err) {
        console.error('Error parsing CDP message:', err);
      }
    };

    const send = (method, params = {}) => ws.send(JSON.stringify({ id: msgId++, method, params }));
    const sendToTarget = (method, params = {}) => {
      const id = msgId++;
      ws.send(JSON.stringify({
        id: msgId++,
        method: 'Target.sendMessageToTarget',
        params: {
          sessionId,
          message: JSON.stringify({ id, method, params })
        }
      }));
    };

    // Activate tab so it isn't frozen/suspended
    send('Target.activateTarget', { targetId: page.id });

    // Attach to tab target
    const attachRes = await new Promise((resolve) => {
      const curId = msgId;
      const handler = (e) => {
        const m = JSON.parse(e.data);
        if (m.id === curId) {
          ws.removeEventListener('message', handler);
          resolve(m);
        }
      };
      ws.addEventListener('message', handler);
      send('Target.attachToTarget', { targetId: page.id, flatten: false });
    });

    sessionId = attachRes.result?.sessionId;

    sendToTarget('Log.enable');
    sendToTarget('Runtime.enable');
    sendToTarget('Page.enable');

    setTimeout(() => {
      console.log(`\n✔ Completed ${durationSec}s capture (${logCount} events recorded).`);
      ws.close();
      process.exit(0);
    }, durationSec * 1000);

  } catch (err) {
    console.error('❌ CDP connection failed:', err.message);
    process.exit(1);
  }
}

run();
