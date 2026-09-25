/**
 * @file audit-wcag-responsive.js
 * @description Audits WCAG 2.1 AA/AAA contrast ratios and tests responsive viewport scaling down to 768px.
 */

import { spawn } from 'node:child_process';

const CHROME_PORT = 9222;
const TARGET_URL = 'http://localhost:3000';

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// WCAG Contrast calculation functions
function parseColor(str, bg = [255, 255, 255]) {
  if (str.startsWith('#')) {
    let hex = str.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return [r, g, b, 1.0];
  }
  const matchRgba = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (matchRgba) {
    const r = parseInt(matchRgba[1], 10);
    const g = parseInt(matchRgba[2], 10);
    const b = parseInt(matchRgba[3], 10);
    const a = matchRgba[4] !== undefined ? parseFloat(matchRgba[4]) : 1.0;
    // Composite over background if alpha < 1
    if (a < 1.0) {
      const cr = Math.round(r * a + bg[0] * (1 - a));
      const cg = Math.round(g * a + bg[1] * (1 - a));
      const cb = Math.round(b * a + bg[2] * (1 - a));
      return [cr, cg, cb, 1.0];
    }
    return [r, g, b, 1.0];
  }
  throw new Error(`Unsupported color format: ${str}`);
}

function getLuminance([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const val = c / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(fgStr, bgStr) {
  const bg = parseColor(bgStr);
  const fg = parseColor(fgStr, [bg[0], bg[1], bg[2]]);
  const l1 = getLuminance(fg);
  const l2 = getLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function auditContrastPairings() {
  console.log('====================================================');
  console.log('1. WCAG 2.1 CONTRAST AUDIT (Top-Bar & Panel Palettes)');
  console.log('====================================================\n');

  const tests = [
    // Top Bar (Light theme base #142e23)
    {
      group: 'Top Bar (Light Theme - #142e23)',
      pairs: [
        { label: 'Brand Title (#ffffff on #142e23)', fg: '#ffffff', bg: '#142e23', min: 4.5 },
        { label: 'Date Text (#ffffff on #142e23)', fg: '#ffffff', bg: '#142e23', min: 4.5 },
        { label: 'Nav Tab Active (#ffffff on #142e23)', fg: '#ffffff', bg: '#142e23', min: 4.5 },
        { label: 'Nav Tab Active Indicator (#d4a017 on #142e23)', fg: '#d4a017', bg: '#142e23', min: 3.0 },
        { label: 'Nav Tab Inactive (rgba(255,255,255,0.75) on #142e23)', fg: 'rgba(255, 255, 255, 0.75)', bg: '#142e23', min: 4.5 },
        { label: 'Nav Tab Inactive Icon (rgba(255,255,255,0.65) on #142e23)', fg: 'rgba(255, 255, 255, 0.65)', bg: '#142e23', min: 3.0 },
        { label: 'Jump Today Button Text (#ffffff on rgba(255,255,255,0.18) over #142e23)', fg: '#ffffff', bg: 'rgba(255, 255, 255, 0.18)', bgBase: '#142e23', min: 4.5 },
        { label: 'Search Trigger Text (#ffffff on rgba(255,255,255,0.15) over #142e23)', fg: '#ffffff', bg: 'rgba(255, 255, 255, 0.15)', bgBase: '#142e23', min: 4.5 }
      ]
    },
    // Top Bar (Dark theme base #0e2119)
    {
      group: 'Top Bar (Dark Theme - #0e2119)',
      pairs: [
        { label: 'Brand Title (#ffffff on #0e2119)', fg: '#ffffff', bg: '#0e2119', min: 4.5 },
        { label: 'Date Text (#ffffff on #0e2119)', fg: '#ffffff', bg: '#0e2119', min: 4.5 },
        { label: 'Nav Tab Active (#ffffff on #0e2119)', fg: '#ffffff', bg: '#0e2119', min: 4.5 },
        { label: 'Nav Tab Active Indicator (#d4a017 on #0e2119)', fg: '#d4a017', bg: '#0e2119', min: 3.0 },
        { label: 'Nav Tab Inactive (rgba(255,255,255,0.75) on #0e2119)', fg: 'rgba(255, 255, 255, 0.75)', bg: '#0e2119', min: 4.5 },
        { label: 'Nav Tab Inactive Icon (rgba(255,255,255,0.65) on #0e2119)', fg: 'rgba(255, 255, 255, 0.65)', bg: '#0e2119', min: 3.0 }
      ]
    },
    // Main Content Panels (Light Theme)
    {
      group: 'Content Panels (Light Theme - Parchment #fcfbfa / White #ffffff)',
      pairs: [
        { label: 'Panel Header Title (#142e23 on #ffffff)', fg: '#142e23', bg: '#ffffff', min: 4.5 },
        { label: 'Panel Header Title (#142e23 on teal-light #e9f5f2)', fg: '#142e23', bg: '#e9f5f2', min: 4.5 },
        { label: 'Body Primary Text (#1c2826 on #ffffff)', fg: '#1c2826', bg: '#ffffff', min: 4.5 },
        { label: 'Muted Text (#5c6b66 on #ffffff)', fg: '#5c6b66', bg: '#ffffff', min: 4.5 },
        { label: 'Body Primary Text (#1c2826 on parchment #fcfbfa)', fg: '#1c2826', bg: '#fcfbfa', min: 4.5 },
        { label: 'Brand Teal Action (#2d6a5a on #ffffff)', fg: '#2d6a5a', bg: '#ffffff', min: 4.5 }
      ]
    },
    // Main Content Panels (Dark Theme)
    {
      group: 'Content Panels (Dark Theme - Forest #0c1813 / Panel #193328)',
      pairs: [
        { label: 'Panel Header Title (#e2f2ec on panel #193328)', fg: '#e2f2ec', bg: '#193328', min: 4.5 },
        { label: 'Body Primary Text (#e2f2ec on panel #193328)', fg: '#e2f2ec', bg: '#193328', min: 4.5 },
        { label: 'Muted Text (#95b3a8 on panel #193328)', fg: '#95b3a8', bg: '#193328', min: 4.5 },
        { label: 'Body Primary Text (#e2f2ec on background #0c1813)', fg: '#e2f2ec', bg: '#0c1813', min: 4.5 },
        { label: 'Teal Accent (#3b8773 on panel #193328 - large/indicator)', fg: '#3b8773', bg: '#193328', min: 3.0 }
      ]
    }
  ];

  let passedAll = true;

  for (const t of tests) {
    console.log(`--- ${t.group} ---`);
    for (const p of t.pairs) {
      let bg = p.bg;
      if (p.bgBase) {
        const base = parseColor(p.bgBase);
        const comp = parseColor(p.bg, [base[0], base[1], base[2]]);
        bg = `rgb(${comp[0]}, ${comp[1]}, ${comp[2]})`;
      }
      const ratio = getContrastRatio(p.fg, bg);
      const passed = ratio >= p.min;
      const status = passed ? '✔ PASS' : '❌ FAIL';
      const level = ratio >= 7.0 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3.0 ? 'AA (Large/UI)' : 'FAIL';
      console.log(`  ${status} [${ratio.toFixed(2)}:1] (${level}) - ${p.label}`);
      if (!passed) passedAll = false;
    }
    console.log('');
  }

  return passedAll;
}

async function getDebuggerUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CHROME_PORT}/json`);
      if (res.ok) {
        const data = await res.json();
        const page = data.find(p => p.type === 'page' && p.url.includes('localhost:3000')) || data[0];
        if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch {
      // Starting up
    }
    await wait(200);
  }
  throw new Error('Failed to obtain WebSocket debugger URL');
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
  }

  ready() {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState === WebSocket.OPEN) return resolve();
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${res.exceptionDetails.text} (${expression})`);
    }
    return res.result?.value;
  }

  close() {
    this.ws.close();
  }
}

async function runResponsiveAudit() {
  console.log('====================================================');
  console.log('2. RESPONSIVE BREAKPOINT & HORIZONTAL OVERFLOW AUDIT');
  console.log('====================================================\n');

  const chromeProcess = spawn('google-chrome', [
    '--headless=new',
    `--remote-debugging-port=${CHROME_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    TARGET_URL
  ], { stdio: 'ignore' });

  const cleanup = () => {
    try {
      chromeProcess.kill();
    } catch {
      // Process killed
    }
  };

  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    const wsUrl = await getDebuggerUrl();
    const cdp = new CDPClient(wsUrl);
    await cdp.ready();
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    // Wait for Alpine initialization
    for (let i = 0; i < 30; i++) {
      const ready = await cdp.eval('Boolean(window.Alpine && document.querySelector("[x-data]")?._x_dataStack)');
      if (ready) break;
      await wait(150);
    }

    const breakpoints = [
      { name: 'Desktop Ultra-Wide (1440px)', width: 1440, height: 900 },
      { name: 'Standard Desktop (1200px)', width: 1200, height: 800 },
      { name: 'Small Desktop / Tablet Landscape (992px)', width: 992, height: 768 },
      { name: 'Tablet Portrait / Target Min Viewport (768px)', width: 768, height: 1024 }
    ];

    const views = ['daily', 'monthly-calendar', 'master-tasks', 'monthly-index', 'future-matrix'];

    let allViewsClean = true;

    for (const bp of breakpoints) {
      console.log(`\nTesting Viewport: ${bp.name} [${bp.width}x${bp.height}]`);
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: bp.width,
        height: bp.height,
        deviceScaleFactor: 1,
        mobile: bp.width < 992
      });
      await wait(150);

      for (const view of views) {
        await cdp.eval(`document.querySelector("[x-data]")._x_dataStack[0].setView("${view}")`);
        await wait(100);

        const check = await cdp.eval(`
          (() => {
            const docEl = document.documentElement;
            const body = document.body;
            const header = document.querySelector('header.single-top-bar');
            const winWidth = window.innerWidth;
            const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
            const headerWidth = header ? header.scrollWidth : 0;
            const overflow = scrollWidth - winWidth;
            return {
              winWidth,
              scrollWidth,
              headerWidth,
              overflow: overflow > 1 ? overflow : 0,
              hasHorizontalOverflow: overflow > 1
            };
          })()
        `);

        if (check.hasHorizontalOverflow) {
          console.error(`  ❌ View "${view}": Horizontal overflow detected! (Window: ${check.winWidth}px, Scroll: ${check.scrollWidth}px, Excess: +${check.overflow}px)`);
          allViewsClean = false;
        } else {
          console.log(`  ✔ View "${view}": Clean fit (Width: ${check.winWidth}px, Scroll: ${check.scrollWidth}px, Top-bar: ${check.headerWidth}px)`);
        }
      }
    }

    cdp.close();
    chromeProcess.kill();

    return allViewsClean;
  } catch (err) {
    console.error('Error during responsive audit:', err);
    cleanup();
    return false;
  }
}

async function main() {
  const contrastPass = auditContrastPairings();
  const responsivePass = await runResponsiveAudit();

  console.log('\n====================================================');
  console.log('SUMMARY AUDIT VERIFICATION');
  console.log('====================================================');
  console.log(`WCAG 2.1 Contrast Audit:   ${contrastPass ? '✅ ALL PAIRINGS PASS AA/AAA' : '❌ FAILURES'}`);
  console.log(`Responsive Scaling (768px): ${responsivePass ? '✅ ZERO HORIZONTAL OVERFLOW' : '❌ OVERFLOW DETECTED'}`);
  console.log('====================================================');

  if (!contrastPass || !responsivePass) {
    process.exit(1);
  }
}

main();
