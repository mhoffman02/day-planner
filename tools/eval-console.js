#!/usr/bin/env node
/**
 * @file tools/eval-console.js
 * @description Evaluates arbitrary JavaScript expressions or prints variables in the active
 * Chrome tab via CDP (port 9222 or custom). Handles background tab throttling via Target.activateTarget.
 *
 * Usage:
 *   node tools/eval-console.js "document.title"
 *   node tools/eval-console.js "window.location.href"
 *   node tools/eval-console.js --iframe "typeof plannerApp !== 'undefined'"
 *   node tools/eval-console.js --tab "Gmail" "document.title"
 */

const args = process.argv.slice(2);
const iframeIdx = args.indexOf('--iframe');
const targetIframe = iframeIdx !== -1;
const tabFilterIdx = args.indexOf('--tab');
const tabFilter = tabFilterIdx !== -1 ? args[tabFilterIdx + 1] : null;

// Filter out flag args
const positionalArgs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--iframe') continue;
  if (args[i] === '--tab') { i++; continue; }
  positionalArgs.push(args[i]);
}

const expression = positionalArgs.join(' ') || 'document.title';
const port = process.env.CDP_PORT || '9222';

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
      page = tabs.find(t => t.type === 'page' && t.title === 'Day Planner') ||
        tabs.find(t => t.type === 'page' && (
          t.url && (t.url.includes('/macros/s/') || t.url.includes('/exec') || t.url.includes('localhost:3000'))
        )) ||
        tabs.find(t => t.type === 'page' && (
          t.url && t.url.includes('script.google.com') && !t.url.includes('/home/projects/')
        )) || tabs.find(t => t.type === 'page');
    }

    if (!page) {
      console.error(`❌ No suitable page tab found on port ${port}.`);
      process.exit(1);
    }

    const verRes = await fetch(`http://127.0.0.1:${port}/json/version`);
    const ver = await verRes.json();
    const ws = new WebSocket(ver.webSocketDebuggerUrl);

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    let sessionId = null;
    const callbacks = new Map();

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.method === 'Target.receivedMessageFromTarget') {
          const inner = JSON.parse(msg.params.message);
          if (inner.id && callbacks.has(inner.id)) {
            const cb = callbacks.get(inner.id);
            callbacks.delete(inner.id);
            cb(inner);
          }
        } else if (msg.id && callbacks.has(msg.id)) {
          const cb = callbacks.get(msg.id);
          callbacks.delete(msg.id);
          cb(msg);
        }
      } catch (e) {
        console.error('Error handling WS message:', e);
      }
    };

    const send = (method, params = {}) => new Promise((resolve) => {
      const id = msgId++;
      callbacks.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

    const sendToTarget = (method, params = {}) => new Promise((resolve) => {
      const id = msgId++;
      callbacks.set(id, resolve);
      ws.send(JSON.stringify({
        id: msgId++,
        method: 'Target.sendMessageToTarget',
        params: {
          sessionId,
          message: JSON.stringify({ id, method, params })
        }
      }));
    });

    // 1. Activate target so Chrome wakes it from background suspension
    await send('Target.activateTarget', { targetId: page.id });

    // 2. Attach to target (child iframe if targetIframe and available, else page)
    const childIframe = tabs.find(t => t.type === 'iframe' && (
      t.parentId === page.id || (t.url && t.url.includes('script.googleusercontent.com'))
    ));
    const targetIdToAttach = (targetIframe && childIframe) ? childIframe.id : page.id;

    const attachRes = await send('Target.attachToTarget', { targetId: targetIdToAttach, flatten: false });
    sessionId = attachRes.result?.sessionId;

    if (!sessionId) {
      console.error('❌ Failed to obtain CDP session ID for target page.');
      ws.close();
      process.exit(1);
    }

    // 3. Format expression if targeting iframe
    let targetExpr = expression;
    if (targetIframe) {
      targetExpr = `(() => {
        const iframe = document.getElementById('userHtmlFrame') || document.querySelector('iframe');
        const targetWindow = iframe ? iframe.contentWindow : window;
        try {
          return targetWindow.eval(${JSON.stringify(expression)});
        } catch (e) {
          return 'Iframe eval error: ' + e.message;
        }
      })()`;
    }

    // 4. Evaluate expression
    const evalRes = await sendToTarget('Runtime.evaluate', {
      expression: targetExpr,
      returnByValue: true,
      awaitPromise: true
    });

    if (evalRes.error) {
      console.error(`💥 Eval Error: ${evalRes.error.message || JSON.stringify(evalRes.error)}`);
    } else if (evalRes.result?.exceptionDetails) {
      const exc = evalRes.result.exceptionDetails;
      console.error(`💥 Exception: ${exc.exception?.description || exc.text}`);
    } else {
      const val = evalRes.result?.result?.value;
      if (typeof val === 'object' && val !== null) {
        console.log(JSON.stringify(val, null, 2));
      } else {
        console.log(val !== undefined ? val : evalRes.result?.result?.description);
      }
    }

    ws.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ CDP Eval failed:', err.message);
    process.exit(1);
  }
}

run();
