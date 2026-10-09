/**
 * @file gasRuntimeStubs.js
 * @description Loads the REAL gas-app/Engines.gs into a node:vm context with GAS service stubs, so
 * tests exercise the generated server code rather than a reimplementation. Pattern adapted from
 * work-request/gsa-tenant-portal-forms/tests/gas-runtime-stubs.js.
 *
 * GOTCHAS (read before extending):
 *  - Load order: .gs files share one global scope and clasp loads them alphabetically. Engines.gs
 *    is one IIFE exposing only the global `DPEngines`; load it via loadEngines(ctx) and read
 *    ctx.DPEngines. Future .gs wrappers must be loaded with loadGasFile(ctx, name) AFTER Engines.gs
 *    only if they read DPEngines at call time (never at top level; see gas-global-init-order rule).
 *  - Cross-realm: objects/arrays created inside the vm have different prototypes than host ones, so
 *    assert.deepStrictEqual (and node:assert/strict's deepEqual, which IS deepStrictEqual) fails on
 *    structurally identical values. Use toHost(value) (JSON round trip) before asserting, or the
 *    legacy loose assert.deepEqual from 'node:assert'. Object.isFrozen works across realms.
 *  - LockService: getScriptLock() returns a NEW handle each call, modelling a separate trigger
 *    execution. All handles share one lock; tryLock fails while another handle holds it.
 *  - Advanced services (Gmail/Calendar/Tasks/Docs) are minimal in-memory fakes of the call shapes
 *    only (no paging/quota/permissions). Extend them in later waves; keep shapes identical to the
 *    real REST resources.
 *  - Never put real email content in fakes.
 */
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const GAS_APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'gas-app');

function gasBytes(value) {
  return typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value);
}

function makeUtilities() {
  return {
    DigestAlgorithm: { MD5: 'md5', SHA_1: 'sha1', SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
    // Real GAS returns signed bytes (-128..127); mirror that.
    computeDigest(algorithm, value) {
      return Array.from(crypto.createHash(algorithm).update(gasBytes(value)).digest(), (b) => (b > 127 ? b - 256 : b));
    },
    base64Encode(value) { return gasBytes(value).toString('base64'); },
    base64EncodeWebSafe(value) { return gasBytes(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'); },
    base64Decode(str) { return Array.from(Buffer.from(String(str), 'base64'), (b) => (b > 127 ? b - 256 : b)); },
    getUuid() { return crypto.randomUUID(); }
  };
}

function makePropertiesService() {
  const make = () => {
    const store = new Map();
    return {
      store,
      getProperty: (k) => (store.has(k) ? store.get(k) : null),
      setProperty(k, v) { store.set(k, String(v)); return this; },
      deleteProperty(k) { store.delete(k); return this; },
      getProperties: () => Object.fromEntries(store)
    };
  };
  const script = make();
  const user = make();
  return { getScriptProperties: () => script, getUserProperties: () => user };
}

function makeLockService() {
  const state = { holder: null, nextId: 1 };
  return {
    state,
    getScriptLock() {
      const id = state.nextId;
      state.nextId += 1;
      return {
        tryLock() {
          if (state.holder !== null && state.holder !== id) return false;
          state.holder = id;
          return true;
        },
        waitLock() {
          if (!this.tryLock()) throw new Error('Could not obtain lock');
        },
        hasLock: () => state.holder === id,
        releaseLock() { if (state.holder === id) state.holder = null; }
      };
    }
  };
}

function makeCacheService() {
  const make = () => {
    const store = new Map();
    return {
      get: (k) => (store.has(k) ? store.get(k) : null),
      put(k, v) { store.set(k, String(v)); },
      putAll(obj) { for (const k of Object.keys(obj)) store.set(k, String(obj[k])); },
      remove(k) { store.delete(k); }
    };
  };
  const script = make();
  return { getScriptCache: () => script, getUserCache: () => make() };
}

/** In-memory fakes with the call shapes of the Advanced services. Seed via the returned `data`. */
function makeAdvancedFakes() {
  const data = { threads: {}, events: [], tasks: [], docs: {}, inaccessibleDocs: new Set(), nextId: 1 };
  const id = (p) => { const v = `${p}${data.nextId}`; data.nextId += 1; return v; };
  const notFound = (what) => { const e = new Error(`${what} not found`); e.code = 404; return e; };
  return {
    data,
    Gmail: {
      Users: {
        Threads: {
          get(userId, threadId) { if (!data.threads[threadId]) throw notFound('thread'); return data.threads[threadId]; },
          list(userId, opts = {}) {
            const all = Object.values(data.threads).filter((t) => !opts.labelIds || (t.labelIds || []).some((l) => opts.labelIds.includes(l)));
            return { threads: all.map((t) => ({ id: t.id })) };
          }
        }
      }
    },
    Calendar: {
      Events: {
        list(calendarId) { return { items: data.events.filter((e) => !e.calendarId || e.calendarId === calendarId) }; },
        get(calendarId, eventId) {
          const e = data.events.find((x) => x.id === eventId);
          if (!e) throw notFound('event');
          return e;
        }
      }
    },
    Tasks: {
      Tasks: {
        list() { return { items: data.tasks.slice() }; },
        get(tasklist, taskId) { const t = data.tasks.find((x) => x.id === taskId); if (!t) throw notFound('task'); return t; },
        insert(task) { const t = { id: id('task'), status: 'needsAction', ...task }; data.tasks.push(t); return t; },
        patch(patch, tasklist, taskId) { const t = this.get(tasklist, taskId); Object.assign(t, patch); return t; }
      }
    },
    Docs: {
      Documents: {
        get(docId) {
          if (data.inaccessibleDocs.has(docId)) { const e = new Error('The caller does not have permission'); e.code = 403; throw e; }
          if (!data.docs[docId]) throw notFound('document');
          return data.docs[docId];
        },
        create(doc) { const docId = id('doc'); data.docs[docId] = { documentId: docId, ...doc }; return data.docs[docId]; },
        batchUpdate(body, docId) { this.get(docId); (data.docs[docId].appliedRequests ||= []).push(...body.requests); return { documentId: docId }; }
      }
    }
  };
}

/**
 * Creates a fresh vm context with GAS stubs. Fresh state per call.
 * @returns {object} context (also exposes ctx.__fakes for seeding Advanced-service data)
 */
export function makeGasContext() {
  const fakes = makeAdvancedFakes();
  const lines = [];
  const context = {
    Utilities: makeUtilities(),
    PropertiesService: makePropertiesService(),
    LockService: makeLockService(),
    CacheService: makeCacheService(),
    Gmail: fakes.Gmail,
    Calendar: fakes.Calendar,
    Tasks: fakes.Tasks,
    Docs: fakes.Docs,
    console: { log: (...a) => lines.push(a.join(' ')), warn: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push(a.join(' ')) },
    __fakes: fakes.data,
    __consoleLines: lines
  };
  vm.createContext(context);
  return context;
}

/** Runs gas-app/<fileName> in the context. */
export function loadGasFile(context, fileName) {
  const source = fs.readFileSync(path.join(GAS_APP_DIR, fileName), 'utf8');
  vm.runInContext(source, context, { filename: fileName });
  return context;
}

/** Loads the generated Engines.gs and returns the frozen DPEngines namespace. */
export function loadEngines(context) {
  loadGasFile(context, 'Engines.gs');
  return context.DPEngines;
}

/** JSON round-trip into host-realm plain data, safe for assert.deepStrictEqual. */
export function toHost(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
