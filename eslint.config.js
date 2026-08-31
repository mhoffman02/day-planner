/**
 * @file ESLint flat config for day-planner.
 * Covers src/*.js (ES modules, browser + GAS-bridge code), tools/*.js and
 * server.js (Node scripts), sw.js (service worker), and gas-app/*.gs
 * (Google Apps Script server files — global functions, GAS built-in
 * globals, no module system).
 */
import js from '@eslint/js';

const gasGlobals = {
  SpreadsheetApp: 'readonly',
  DriveApp: 'readonly',
  CalendarApp: 'readonly',
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
    ignores: ['node_modules/**', 'gh-pwa-shell/**', 'gas-app/vendor/**', 'src/vendor/**']
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
        URLSearchParams: 'readonly'
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
    files: ['sw.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
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
      // GAS concatenates all .gs files into one shared global scope at
      // runtime, so cross-file function refs are false positives here.
      'no-undef': 'off'
    }
  }
];
