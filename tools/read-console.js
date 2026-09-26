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
 */

const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const port = portIdx !== -1 ? args[portIdx + 1] : (process.env.CDP_PORT || '9222');
const tailIdx = args.indexOf('--tail');
const durationSec = tailIdx !== -1 ? parseInt(args[tailIdx + 1], 10) : 10;

async function run() {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json`);
    if (!res.ok) {
      console.error(`❌ Chrome not responding on http://127.0.0.1:${port}`);
      process.exit(1);
    }

    const tabs = await res.json();
    const page = tabs.find(t => t.type === 'page' && (
      t.title.includes('Day Planner') ||
      t.url.includes('script.google.com') ||
      t.url.includes('localhost:3000')
    ));

    if (!page) {
      console.log(`⚠️ No active Day Planner tab found on port ${port}. Open tabs:`);
      tabs.filter(t => t.type === 'page').forEach(t => console.log(`  - [${t.title}] ${t.url}`));
      process.exit(0);
    }

    console.log(`📡 Attached to tab: "${page.title}" (${page.url})`);
    console.log(`⏳ Listening to console for ${durationSec}s...\n`);

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    const send = (method, params = {}) => ws.send(JSON.stringify({ id: msgId++, method, params }));

    let logCount = 0;
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.method === 'Runtime.consoleAPICalled') {
          logCount++;
          const type = msg.params.type.toUpperCase();
          const timestamp = new Date(msg.params.timestamp || Date.now()).toLocaleTimeString();
          const text = msg.params.args.map(a => {
            if (a.value !== undefined) {
              return typeof a.value === 'object' ? JSON.stringify(a.value) : String(a.value);
            }
            return a.description || '';
          }).join(' ');

          const icon = type === 'ERROR' ? '❌' : type === 'WARNING' || type === 'WARN' ? '⚠️' : 'ℹ️';
          console.log(`${icon} [${timestamp}] [console.${msg.params.type}]: ${text}`);
        } else if (msg.method === 'Runtime.exceptionThrown') {
          logCount++;
          const exc = msg.params.exceptionDetails;
          const text = exc.exception?.description || exc.text;
          console.log(`💥 [Uncaught Exception]: ${text} (${exc.url || 'eval'}:${exc.lineNumber})`);
        } else if (msg.method === 'Log.entryAdded') {
          const entry = msg.params.entry;
          if (entry.level === 'error' || entry.level === 'warning') {
            logCount++;
            console.log(`📋 [Browser ${entry.level.toUpperCase()}]: ${entry.text}`);
          }
        }
      } catch (err) {
        console.error('Error parsing CDP message:', err);
      }
    };

    send('Log.enable');
    send('Runtime.enable');
    send('Page.enable');

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
