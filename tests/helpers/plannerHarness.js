/**
 * @file plannerHarness.js
 * @description Loads the REAL plannerApp Alpine component factory from either client copy --
 * src/app.js (local preview) or gas-app/Script.html (production GAS client) -- into node, so a
 * single test exercises the same method in both files and catches parity drift. Script.html is
 * evaluated as a plain script with stub window/document/Alpine; app.js has its ESM imports
 * stripped (via acorn) and re-injected from the real src modules, with a fake Alpine.
 * Everything runs in the main realm (new Function, not node:vm) so arrays/objects passed in by
 * tests stay deepStrictEqual-comparable.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as acorn from 'acorn';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Immediate timer stub: runs callbacks on the next macrotask, ignoring the delay. */
export function immediateTimers() {
  return {
    setTimeout: (fn) => setImmediate(fn),
    clearTimeout: (h) => { if (h) clearImmediate(h); }
  };
}

/** Lets queued immediates/microtasks run (async bridge stubs, debounced timers, sync delay). */
export async function settle(rounds = 20) {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r));
}

function fakeAlpine(captured) {
  return { data: (name, factory) => { captured[name] = factory; }, start: () => {} };
}

class StubEvent { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } }

function stubDocument() {
  return {
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} }),
    documentElement: { style: {}, setAttribute: () => {} },
    body: { style: {}, contains: () => true, classList: { add: () => {}, remove: () => {} } }
  };
}

function scriptHtmlBody() {
  // DP_SCRIPT_HTML / DP_APP_JS: optional override paths, used to replay these tests against a
  // pre-fix copy of a client file and prove each test was red for the diagnosed reason.
  const text = fs.readFileSync(process.env.DP_SCRIPT_HTML || path.join(root, 'gas-app', 'Script.html'), 'utf8');
  const start = text.indexOf('<script>');
  const end = text.lastIndexOf('</script>');
  if (start !== 0 || end === -1) throw new Error('Script.html: expected a single outer <script> block');
  return text.slice(start + '<script>'.length, end);
}

/**
 * Evaluates gas-app/Script.html and returns { factory, scope } where scope holds the named
 * top-level functions requested (e.g. dpSetCached) for direct testing of mirrored helpers.
 * @param {{exportNames?: string[], indexedDB?: object, timers?: object}} [opts]
 */
export function loadScriptHtml({ exportNames = [], indexedDB, timers = immediateTimers() } = {}) {
  const captured = {};
  const win = { Alpine: fakeAlpine(captured), Event: StubEvent, addEventListener: () => {}, location: { href: '' } };
  const ret = '\n;return {' + exportNames.map((n) => `${n}: (typeof ${n} !== 'undefined' ? ${n} : undefined)`).join(',') + '};';
  const fn = new Function('window', 'document', 'indexedDB', 'setTimeout', 'clearTimeout', scriptHtmlBody() + ret);
  const scope = fn(win, stubDocument(), indexedDB, timers.setTimeout, timers.clearTimeout);
  if (typeof captured.plannerApp !== 'function') throw new Error('Script.html did not register plannerApp');
  return { factory: captured.plannerApp, scope };
}

/**
 * Evaluates src/app.js with its imports re-injected from the real src modules.
 * @param {{timers?: object}} [opts]
 */
export async function loadAppJs({ timers = immediateTimers() } = {}) {
  const file = path.join(root, 'src', 'app.js');
  const text = fs.readFileSync(process.env.DP_APP_JS || file, 'utf8');
  const ast = acorn.parse(text, { ecmaVersion: 2022, sourceType: 'module' });
  const names = [];
  const values = [];
  const captured = {};
  let body = text;
  const imports = ast.body.filter((n) => n.type === 'ImportDeclaration');
  for (const node of imports.slice().reverse()) {
    body = body.slice(0, node.start) + ' '.repeat(node.end - node.start) + body.slice(node.end);
  }
  for (const node of imports) {
    const src = node.source.value;
    if (/^https?:/.test(src)) {
      for (const s of node.specifiers) { names.push(s.local.name); values.push(fakeAlpine(captured)); }
      continue;
    }
    const mod = await import(pathToFileURL(path.join(path.dirname(file), src)).href);
    for (const s of node.specifiers) {
      const imported = s.type === 'ImportDefaultSpecifier' ? 'default' : s.imported.name;
      if (!(imported in mod)) throw new Error(`app.js imports missing export ${imported} from ${src}`);
      names.push(s.local.name);
      values.push(mod[imported]);
    }
  }
  const win = { Event: StubEvent, addEventListener: () => {}, location: { href: '' } };
  const fn = new Function(...names, 'window', 'document', 'setTimeout', 'clearTimeout', body);
  fn(...values, win, stubDocument(), timers.setTimeout, timers.clearTimeout);
  if (typeof captured.plannerApp !== 'function') throw new Error('app.js did not register plannerApp');
  return { factory: captured.plannerApp };
}

const CACHE_API = [
  'getCached', 'setCached', 'getCachedMasterTasks', 'setCachedMasterTasks',
  'getCachedFutureMatrix', 'setCachedFutureMatrix', 'getNoteRevisions'
];

/**
 * Both client copies, each with a uniform `cache` view onto ITS OWN cache implementation
 * (src/dailyDataCache.js for app.js, the dp* mirror inside Script.html), freshly reset.
 * Usage: `for (const c of await bothClients()) { ... }`.
 */
export async function bothClients(opts = {}) {
  const cacheMod = await import(pathToFileURL(path.join(root, 'src', 'dailyDataCache.js')).href);
  cacheMod.clearMemoryCache();
  const appCache = {};
  CACHE_API.forEach((n) => { appCache[n] = cacheMod[n]; });

  const dpNames = CACHE_API.map((n) => 'dp' + n[0].toUpperCase() + n.slice(1));
  const gas = loadScriptHtml({ ...opts, exportNames: [...(opts.exportNames || []), ...dpNames] });
  const gasCache = {};
  CACHE_API.forEach((n, i) => {
    if (typeof gas.scope[dpNames[i]] !== 'function') throw new Error(`Script.html missing ${dpNames[i]}`);
    gasCache[n] = gas.scope[dpNames[i]];
  });

  return [
    { label: 'src/app.js', ...(await loadAppJs(opts)), cache: appCache },
    { label: 'gas-app/Script.html', ...gas, cache: gasCache }
  ];
}

/** Captures console.error calls for the duration of fn; returns the joined call strings. */
export async function captureConsoleError(fn) {
  const calls = [];
  const orig = console.error;
  console.error = (...args) => { calls.push(args.map((a) => (a && a.stack) ? a.stack : String(a)).join(' ')); };
  try {
    await fn();
  } finally {
    console.error = orig;
  }
  return calls;
}

/** Builds a component instance with Alpine magics stubbed and the given state/bridge merged in. */
export function makeVm(factory, overrides = {}) {
  const vm = factory();
  vm.$nextTick = (fn) => { if (fn) fn(); };
  vm.$refs = {};
  vm.$watch = () => {};
  return Object.assign(vm, overrides);
}
