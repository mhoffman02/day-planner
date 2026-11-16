/**
 * @file clientTelemetry.js
 * @description Client error telemetry, adapted from the LiteConsole client-server logging bridge
 * (gsai-gas-project-template documents/developer-guide/09-lite-console.md, logFromClient). Uncaught errors,
 * unhandled rejections and console.error calls go to the server log (Code.gs logFromClient, then recordServerLog:
 * ring buffer + Run Log Doc), so a bug in the released app announces itself. Capped and de-duplicated per page
 * load so an error loop cannot flood google.script.run. Mirrored verbatim in gas-app/Script.html
 * (tests/clientTelemetry.test.js runs both copies).
 */

export const TELEMETRY_MAX_PER_PAGE = 10;
const TELEMETRY_MAX_MESSAGE = 1000;
const TELEMETRY_MAX_STACK = 4000;

/**
 * @param {function(string, string, {stack: string, view: string, build: string}): void} send Delivers one entry.
 * @param {function(): {view?: string, build?: (number|string)}} getContext Current view and build number.
 * @param {number} [maxPerPage] Most entries sent per page load.
 * @returns {{report: function(string, *, *): boolean}} report returns false when capped or a repeat.
 */
export function createClientTelemetry(send, getContext, maxPerPage = TELEMETRY_MAX_PER_PAGE) {
  const seen = new Set();
  let sent = 0;
  function report(level, message, stack) {
    const text = String(message).slice(0, TELEMETRY_MAX_MESSAGE);
    const key = level + ' ' + text;
    if (sent >= maxPerPage || seen.has(key)) return false;
    seen.add(key);
    sent += 1;
    const ctx = getContext() || {};
    send(level, text, {
      stack: stack ? String(stack).slice(0, TELEMETRY_MAX_STACK) : '',
      view: ctx.view ? String(ctx.view) : '',
      build: ctx.build === undefined || ctx.build === null ? '' : String(ctx.build)
    });
    return true;
  }
  return { report };
}

/** @returns {{message: string, stack: string}} Message and stack of an Error, or the value as text. */
export function errorParts(value) {
  if (value instanceof Error) return { message: value.message, stack: value.stack || '' };
  return { message: String(value), stack: '' };
}

/**
 * Reads console.error arguments. The fail-loud shape is one string "context newline stack"; Error arguments
 * add their message and stack; objects are shown as JSON.
 * @returns {{message: string, stack: string}}
 */
export function consoleParts(args) {
  const words = [];
  let stack = '';
  for (const arg of args) {
    if (arg instanceof Error) {
      words.push(arg.message);
      if (!stack) stack = arg.stack || '';
    } else if (typeof arg === 'string') {
      const cut = arg.indexOf('\n');
      if (cut === -1) {
        words.push(arg);
      } else {
        words.push(arg.slice(0, cut));
        if (!stack) stack = arg.slice(cut + 1);
      }
    } else {
      words.push(JSON.stringify(arg));
    }
  }
  return { message: words.join(' '), stack };
}

/**
 * Hooks window errors, unhandled rejections and console.error into telemetry.report. console.error still prints.
 * @returns {function(...*): void} The original console.error, for logging that must not be forwarded.
 */
export function installClientTelemetry(win, telemetry) {
  const original = win.console.error.bind(win.console);
  win.addEventListener('error', function (event) {
    const parts = errorParts(event.error || event.message);
    telemetry.report('ERROR', 'Uncaught ' + parts.message, parts.stack);
  });
  win.addEventListener('unhandledrejection', function (event) {
    const parts = errorParts(event.reason);
    telemetry.report('ERROR', 'Unhandled rejection ' + parts.message, parts.stack);
  });
  win.console.error = function (...args) {
    original(...args);
    const parts = consoleParts(args);
    telemetry.report('ERROR', parts.message, parts.stack);
  };
  return original;
}
