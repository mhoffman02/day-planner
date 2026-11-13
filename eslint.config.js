/**
 * @file ESLint flat config for day-planner.
 * Covers src/*.js (ES modules, browser + GAS-bridge code), tools/*.js and
 * server.js (Node scripts), tests/*.js, and gas-app/*.gs
 * (Google Apps Script server files — global functions, GAS built-in
 * globals, no module system).
 */
import js from '@eslint/js';
import promise from 'eslint-plugin-promise';

// `toISOString().slice(0, 10)` is the UTC day: after 20:00 EDT it is tomorrow (2331533, 12 sites
// on 2026-10-30). Flat config replaces rule options per block, so the gas-app block repeats it.
const UTC_DAY_KEY = {
  selector: "CallExpression[callee.property.name=/^(slice|substring|split)$/][callee.object.callee.property.name='toISOString']",
  message: 'UTC day shift: use a local date (getLocalDateStr, taskPlannerLocalDate, toLocaleDateString("en-CA")).'
};
// Node only. Shell strings are injectable and an untimed child or fetch hangs a pipeline forever.
const NODE_SAFETY = [
  { selector: "CallExpression[callee.name=/^(exec|execSync)$/], CallExpression[callee.property.name=/^(exec|execSync)$/][callee.object.name=/^(child_process|cp)$/]", message: 'Shell string: use execFile/execFileSync/spawn with an argv array (no shell).' },
  { selector: "CallExpression[callee.name='fetch'][arguments.length<2]", message: 'fetch needs an options object with signal: AbortSignal.timeout(ms).' },
  { selector: "CallExpression[callee.name=/^(execFileSync|spawnSync)$/][arguments.length<3]", message: 'Child process needs an options object with timeout: ms.' }
];
// External-API loops need a page cap and a time budget (6077c04, Gmail quota).
const UNBOUNDED_LOOP = {
  selector: "WhileStatement[test.raw='true'], DoWhileStatement[test.raw='true'], ForStatement[test=null]",
  message: 'Unbounded loop: give it a counter cap or a time budget.'
};
// clasp loads .gs files alphabetically, so a top-level value can be read before it is set.
const GAS_GLOBALS = [
  { selector: 'Program > VariableDeclaration', message: 'No GAS globals: put it inside the file IIFE namespace (gas-namespace-iife.md).' },
  { selector: "AssignmentExpression[left.object.name='global'][right.type=/^(Literal|ArrayExpression|ObjectExpression|TemplateLiteral|NewExpression)$/]", message: 'global.X gets functions or frozen namespaces only, never a value (gas-global-init-order.md).' }
];

// gas-app/*.html: lint every inline <script> body as one script with the file's own line and column
// numbers (everything else, src= scripts and GAS scriptlets become spaces; a scriptlet becomes `0`).
// Before 2026-10-30 these 7.7k lines were never linted.
const gasHtmlProcessor = {
  meta: { name: 'gas-html-scripts' },
  preprocess(text) {
    const blank = (s) => s.replace(/[^\n]/g, ' ');
    let out = '';
    let last = 0;
    const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      const bodyStart = m.index + m[0].length - m[2].length - '</script>'.length;
      out += blank(text.slice(last, bodyStart));
      const body = /\ssrc\s*=/i.test(m[1] || '') ? blank(m[2]) : m[2].replace(/<\?[\s\S]*?\?>/g, (s) => '0' + blank(s).slice(1));
      out += body;
      last = bodyStart + m[2].length;
    }
    return [out + blank(text.slice(last))];
  },
  postprocess: (messages) => messages.flat(),
  supportsAutofix: false
};

const gasGlobals = {
  SpreadsheetApp: 'readonly',
  DriveApp: 'readonly',
  // No CalendarApp: it needs the broad calendar scope; the app runs on calendar.events via Advanced Calendar.
  Tasks: 'readonly',
  Calendar: 'readonly',
  ContentService: 'readonly',
  HtmlService: 'readonly',
  PropertiesService: 'readonly',
  ScriptApp: 'readonly',
  Utilities: 'readonly',
  Logger: 'readonly',
  DocumentApp: 'readonly',
  UrlFetchApp: 'readonly',
  Session: 'readonly',
  LockService: 'readonly',
  CacheService: 'readonly',
  console: 'readonly'
};

export default [
  js.configs.recommended,
  {
    ignores: ['node_modules/**', 'gas-app/vendor/**', 'src/vendor/**']
  },
  {
    // Solid Code 2.0 decision 2T (2026-10-30). GAS V8 has let/const, so no-var covers gas-app too; its
    // legacy vars are grandfathered in eslint-suppressions.json, which only shrinks (--prune-suppressions).
    files: ['**/*.js', '**/*.gs', 'gas-app/**/*.html'],
    rules: {
      // `x == null` is the one idiom kept: it tests null and undefined together.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-param-reassign': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-throw-literal': 'error',
      'no-restricted-syntax': ['error', UTC_DAY_KEY, UNBOUNDED_LOOP],
      'no-restricted-properties': ['error', { property: 'substr', message: 'Deprecated: use slice().' }],
      'no-implicit-coercion': ['error', { boolean: false }],
      complexity: ['error', 15]   // legacy hits are in eslint-suppressions.json and only shrink
    }
  },
  {
    // Node-run files: process-safety bans and promise hygiene.
    files: ['tools/**/*.js', 'server.js'],
    plugins: { promise },
    rules: {
      'no-restricted-syntax': ['error', UTC_DAY_KEY, UNBOUNDED_LOOP, ...NODE_SAFETY],
      'promise/catch-or-return': 'error',   // a floating promise is a swallowed failure
      'promise/no-return-wrap': 'error',
      'promise/param-names': 'error'
    }
  },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        indexedDB: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        navigator: 'readonly',
        Alpine: 'readonly',
        google: 'readonly',
        caches: 'readonly',
        self: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestIdleCallback: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        crypto: 'readonly',
        Blob: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'warn'
    }
  },
  {
    files: ['tools/**/*.js', 'server.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        WebSocket: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'warn'
    }
  },
  {
    // tests/*.test.js run under `node --test` (see CLAUDE.md Commands), not the browser or
    // GAS runtime the other blocks above cover, so they need Node's own env globals.
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        global: 'writable',
        process: 'readonly',
        queueMicrotask: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'warn'
    }
  },
  {
    files: ['gas-app/**/*.gs'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: gasGlobals
    },
    rules: {
      // vars: 'local' skips top-level (global-scope) declarations — GAS entry points
      // are called by name from HTML/triggers/other .gs files, never referenced within
      // their own file, so the default 'all' setting flags every one as unused. Local
      // vars/params inside function bodies are still checked normally.
      'no-unused-vars': ['warn', { vars: 'local' }],
      // Phase 28: GmailApp needs the full mail.google.com scope. Use the Advanced Gmail
      // service (gmail.readonly). (Legacy SpreadsheetApp use in Code.gs predates this rule.)
      'no-restricted-syntax': ['error',
        { selector: "Identifier[name='GmailApp']", message: 'GmailApp requires the full mail scope. Use the Advanced Gmail service (gmail.readonly).' },
        UTC_DAY_KEY,
        UNBOUNDED_LOOP,
        ...GAS_GLOBALS
      ],
      // GAS concatenates all .gs files into one shared global scope at
      // runtime, so cross-file function refs are false positives here.
      'no-undef': 'off',
      // 'use strict'; is the first statement of every .gs file (V8 applies it per file).
      strict: ['error', 'global']
    }
  },
  {
    // Browser scripts in the HtmlService page share one global scope across blocks and files, so
    // no-undef/no-unused-vars cannot judge them; the 2T rules and the date/loop bans still apply.
    files: ['gas-app/**/*.html'],
    processor: gasHtmlProcessor,
    languageOptions: { ecmaVersion: 'latest', sourceType: 'script' },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off'
    }
  }
];
