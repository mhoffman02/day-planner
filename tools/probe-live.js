#!/usr/bin/env node
/**
 * @file tools/probe-live.js
 * @module tools/probe-live
 * @description Lightweight live probe for Day Planner in Chrome over CDP.
 * Senses active tab status, Apps Script iframe health, Alpine/plannerApp initialization,
 * and streams console errors to power rapid sense→diagnose→fix→test cycles.
 *
 * Usage:
 *   node tools/probe-live.js              # Human-readable health check
 *   node tools/probe-live.js --json       # Machine-readable JSON for agents/models
 *   node tools/probe-live.js --tail 5     # Listen to console for 5 seconds during probe
 *   node tools/probe-live.js --port 9222  # Custom CDP port
 */

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const tailIdx = args.indexOf('--tail');
const tailSec = tailIdx !== -1 ? parseInt(args[tailIdx + 1], 10) : 2;
const portIdx = args.indexOf('--port');
const port = portIdx !== -1 ? args[portIdx + 1] : (process.env.CDP_PORT || '9222');

async function probe() {
  const result = {
    timestamp: new Date().toISOString(),
    status: 'UNKNOWN',
    target: null,
    checks: {},
    errors: [],
    warnings: [],
    diagnosis: null,
    recommendations: []
  };

  try {
    // 1. Check CDP reachability
    let tabs;
    try {
      const tabsRes = await fetch(`http://127.0.0.1:${port}/json`);
      if (!tabsRes.ok) throw new Error(`HTTP ${tabsRes.status}`);
      tabs = await tabsRes.json();
    } catch (err) {
      result.status = 'FAIL';
      result.diagnosis = `Chrome CDP unreachable on port ${port}`;
      result.recommendations.push(
        'Verify Chrome is running with --remote-debugging-port=9222',
        'Run: node tools/ensure-chrome.js to launch or attach to Chrome'
      );
      outputResult(result, jsonMode);
      process.exit(1);
    }

    result.checks.cdpConnected = true;

    // 2. Identify Day Planner page tab
    const page = tabs.find(t => t.type === 'page' && (
      t.title === 'Day Planner' ||
      (t.url && t.url.includes('script.google.com')) ||
      (t.url && t.url.includes('localhost:3000'))
    )) || tabs.find(t => t.type === 'page');

    if (!page) {
      result.status = 'FAIL';
      result.diagnosis = 'No suitable Day Planner browser tab found';
      result.recommendations.push('Open Day Planner URL in Chrome or run node tools/ensure-chrome.js');
      outputResult(result, jsonMode);
      process.exit(1);
    }

    result.target = {
      id: page.id,
      title: page.title,
      url: page.url
    };

    // 3. Connect to Browser WS
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
          if (inner.method === 'Runtime.consoleAPICalled') {
            const type = inner.params.type;
            const text = (inner.params.args || []).map(a => a.value !== undefined ? (typeof a.value === 'object' ? JSON.stringify(a.value) : a.value) : a.description || '').join(' ');
            if (type === 'error') result.errors.push(`[console.error]: ${text}`);
            else if (type === 'warning' || type === 'warn') result.warnings.push(`[console.warn]: ${text}`);
          } else if (inner.method === 'Runtime.exceptionThrown') {
            const exc = inner.params.exceptionDetails;
            result.errors.push(`[Uncaught Exception]: ${exc.exception?.description || exc.text}`);
          } else if (inner.id && callbacks.has(inner.id)) {
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
        result.warnings.push(`CDP message parse warning: ${e.message}`);
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

    // 4. Activate target tab to prevent background timer freeze
    await send('Target.activateTarget', { targetId: page.id });

    // 5. Attach to page target
    const attachRes = await send('Target.attachToTarget', { targetId: page.id, flatten: false });
    sessionId = attachRes.result?.sessionId;

    if (!sessionId) {
      throw new Error('Failed to attach to page target via CDP');
    }

    // Enable console and runtime events
    await sendToTarget('Log.enable');
    await sendToTarget('Runtime.enable');
    await sendToTarget('Page.enable');

    // 6. Outer document probe
    const outerEval = await sendToTarget('Runtime.evaluate', {
      expression: `({
        title: document.title,
        url: window.location.href,
        hasIframe: Boolean(document.getElementById("userHtmlFrame")),
        iframeSrc: document.getElementById("userHtmlFrame")?.src || null,
        bodySnippet: document.body?.innerText?.substring(0, 300) || ""
      })`,
      returnByValue: true
    });

    const outer = outerEval.result?.result?.value || {};
    result.checks.outerPage = outer;

    // Check for Google Drive error screen (e.g. 404 Page Not Found)
    if (outer.title === 'Page Not Found' || (outer.bodySnippet && outer.bodySnippet.includes('unable to open the file'))) {
      result.status = 'FAIL';
      result.diagnosis = 'Google Apps Script web app returned "Page Not Found" (Drive 404 / invalid deployment / session expired)';
      result.recommendations.push(
        'Verify deployment URL in GAS project or deploy a new Web App version via clasp',
        'Check that the active Google account has permission to access the script deployment',
        'Navigate the tab to the active @HEAD /dev URL or re-deploy'
      );
    } else {
      // 7. Inner Iframe / App probe
      const innerEval = await sendToTarget('Runtime.evaluate', {
        expression: `(() => {
          const iframe = document.getElementById("userHtmlFrame");
          const targetWindow = iframe ? iframe.contentWindow : window;
          const targetDoc = iframe ? iframe.contentDocument : document;
          if (!targetDoc) return { loaded: false, error: 'Document inaccessible' };

          try {
            const hasAlpine = Boolean(targetWindow.Alpine);
            const xDataEl = targetDoc.querySelector("[x-data]");
            const appData = xDataEl?._x_dataStack?.[0] || targetWindow.plannerApp || null;
            return {
              loaded: true,
              inIframe: Boolean(iframe),
              docTitle: targetDoc.title,
              hasAlpine,
              hasAppInstance: Boolean(appData),
              activeView: appData?.activeView || null,
              dailyTasksCount: appData?.dailyTasks?.length ?? null,
              masterTasksCount: appData?.masterTasks?.length ?? null,
              noteCardsCount: appData?.noteCards?.length ?? null,
              activeTheme: targetDoc.documentElement?.getAttribute('data-theme') || null,
              domSummary: {
                hasHeader: Boolean(targetDoc.querySelector('header, .app-header, .top-header')),
                hasNav: Boolean(targetDoc.querySelector('nav, .view-navigation, .nav-tabs')),
                hasCards: Boolean(targetDoc.querySelector('.note-card, .notes-container, .schedule-column'))
              }
            };
          } catch (e) {
            return { loaded: false, error: e.message };
          }
        })()`,
        returnByValue: true,
        awaitPromise: true
      });

      const inner = innerEval.result?.result?.value || {};
      result.checks.appState = inner;

      if (!inner.loaded) {
        result.status = 'FAIL';
        result.diagnosis = `App iframe evaluation failed: ${inner.error || 'Unknown error'}`;
        result.recommendations.push('Wait for iframe to finish loading or inspect frame security permissions');
      } else if (!inner.hasAppInstance && !inner.hasAlpine) {
        result.status = 'WARN';
        result.diagnosis = 'App UI loaded but Alpine.js / plannerApp instance not detected yet';
        result.recommendations.push('Check browser console for script loading or syntax errors');
      } else {
        result.status = 'PASS';
        result.diagnosis = 'Live Day Planner app responsive and initialized';
      }
    }

    // 8. Stream console logs briefly for transient runtime errors
    if (tailSec > 0) {
      await new Promise(r => setTimeout(r, tailSec * 1000));
    }

    if (result.errors.length > 0 && result.status === 'PASS') {
      result.status = 'WARN';
      result.diagnosis = `App initialized but ${result.errors.length} console error(s) detected`;
    }

    ws.close();
    outputResult(result, jsonMode);
    process.exit(result.status === 'PASS' ? 0 : 1);

  } catch (err) {
    result.status = 'ERROR';
    result.diagnosis = `Probe execution error: ${err.message}`;
    result.errors.push(err.stack || err.message);
    outputResult(result, jsonMode);
    process.exit(1);
  }
}

function outputResult(result, jsonMode) {
  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const icon = result.status === 'PASS' ? '✅' : result.status === 'WARN' ? '⚠️' : '❌';
  console.log(`\n${icon} [PROBE] Status: ${result.status} (${result.timestamp})`);
  console.log(`📌 Diagnosis: ${result.diagnosis || 'None'}`);

  if (result.target) {
    console.log(`🌐 Target: "${result.target.title}" [${result.target.url}]`);
  }

  if (result.checks.appState && result.checks.appState.loaded) {
    const s = result.checks.appState;
    console.log('📊 App State:');
    console.log(`   - Active View: ${s.activeView || 'N/A'}`);
    console.log(`   - Daily Tasks: ${s.dailyTasksCount ?? 'N/A'} | Master Tasks: ${s.masterTasksCount ?? 'N/A'} | Notes: ${s.noteCardsCount ?? 'N/A'}`);
    console.log(`   - Theme: ${s.activeTheme || 'default'} | In Iframe: ${s.inIframe}`);
  }

  if (result.errors.length > 0) {
    console.log(`\n🚨 Errors (${result.errors.length}):`);
    result.errors.forEach(e => console.log(`   - ${e}`));
  }

  if (result.warnings.length > 0) {
    console.log(`\n⚠️ Warnings (${result.warnings.length}):`);
    result.warnings.forEach(w => console.log(`   - ${w}`));
  }

  if (result.recommendations.length > 0) {
    console.log('\n💡 Recommended Actions:');
    result.recommendations.forEach(r => console.log(`   👉 ${r}`));
  }
  console.log('');
}

probe();
