/**
 * @file hubConfig.test.js
 * @description vm tests for gas-app/Config.gs (DPConfig) plus cross-file checks for the Wave 2-D
 * .gs files: global-leak enumeration, GmailApp/SpreadsheetApp ban, and appsscript.json scopes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeGasContext, loadEngines, loadGasFile, toHost } from './helpers/gasRuntimeStubs.js';

const gasDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'gas-app');
const OWN_FILES = ['Config.gs', 'LedgerRepository.gs', 'NotesRepository.gs'];

function setup() {
  const ctx = makeGasContext();
  loadEngines(ctx);
  loadGasFile(ctx, 'Config.gs');
  ctx.PropertiesService.getUserProperties().setProperty('DAY_PLANNER_ROOT_FOLDER_ID', 'FOLDER1');
  return ctx;
}

function configTab(ctx) {
  const id = ctx.PropertiesService.getUserProperties().getProperty('DP_HUB_SHEET_ID');
  return ctx.__fakes.sheets[id].tabs.find((t) => t.title === 'Config');
}

test('(a) ensureSetup twice creates exactly one Sheet and seeds the registry once', () => {
  const ctx = setup();
  const id1 = ctx.DPConfig.ensureSetup();
  const id2 = ctx.DPConfig.ensureSetup();
  assert.equal(id1, id2);
  assert.equal(ctx.__fakes.driveFiles.filter((f) => f.mimeType.endsWith('spreadsheet')).length, 1);
  const tabs = ctx.__fakes.sheets[id1].tabs.map((t) => t.title);
  assert.deepEqual(toHost(tabs), ['Config', 'Meeting Registry', 'Integration Ledger', 'Integration Ledger Archive']);
  const reg = ctx.__fakes.sheets[id1].tabs[1].rows;
  assert.equal(reg.length, 1 + ctx.DPEngines.DEFAULT_SERIES.length);
  const registry = ctx.DPConfig.getRegistry();
  assert.equal(registry.length, 10);
  assert.deepEqual(toHost(registry.filter((r) => r.Enabled).map((r) => r.SeriesKey)), ['NCMMS_CORE', 'NCMMS_DAILY', 'NCMMS_AA', 'NCMMS_ACQ', 'TRM_PM']);
  assert.deepEqual(toHost(ctx.__fakes.sheets[id1].tabs[2].rows[0]), toHost(ctx.DPEngines.LEDGER_COLUMNS));
});

test('(a) crash recovery: lost property adopts the existing Sheet by name without reseeding', () => {
  const ctx = setup();
  const id = ctx.DPConfig.ensureSetup();
  ctx.PropertiesService.getUserProperties().deleteProperty('DP_HUB_SHEET_ID');
  assert.equal(ctx.DPConfig.ensureSetup(), id);
  assert.equal(ctx.__fakes.driveFiles.length, 1);
  assert.equal(ctx.__fakes.sheets[id].tabs[1].rows.length, 11);
});

test('ensureSetup without a bound Day Planner folder throws SETUP_ERROR', () => {
  const ctx = makeGasContext();
  loadEngines(ctx);
  loadGasFile(ctx, 'Config.gs');
  assert.throws(() => ctx.DPConfig.ensureSetup(), (e) => e.message.startsWith('SETUP_ERROR:') && e.message.includes('DAY_PLANNER_ROOT_FOLDER_ID'));
});

test('(b) missing TimeZone throws SETUP_ERROR naming the key', () => {
  const ctx = setup();
  ctx.DPConfig.ensureSetup();
  const row = configTab(ctx).rows.find((r) => r[0] === 'TimeZone');
  row[1] = '';
  assert.throws(() => ctx.DPConfig.getConfig(), (e) => e.message.startsWith('SETUP_ERROR:') && e.message.includes('TimeZone'));
});

test('getConfig returns typed, frozen values with defaults', () => {
  const ctx = setup();
  const cfg = ctx.DPConfig.getConfig();
  assert.equal(cfg.TimeZone, 'America/New_York');
  assert.equal(cfg.UserEmail, 'tester@example.com');
  assert.equal(cfg.TasksListId, '@default');
  assert.equal(cfg.BatchSize, 25);
  assert.equal(cfg.MaxExcerptChars, 160);
  assert.deepEqual(toHost(cfg.ExcludedAiLabels), toHost(ctx.DPEngines.AI_EXCLUDED_LABELS));
  assert.ok(Object.isFrozen(cfg));
  configTab(ctx).rows.find((r) => r[0] === 'BatchSize')[1] = 'abc';
  assert.throws(() => ctx.DPConfig.getConfig(), (e) => e.message.startsWith('SETUP_ERROR:') && e.message.includes('BatchSize'));
});

test('(c) features default DRY_RUN true and all other flags false', () => {
  const ctx = setup();
  const f = toHost(ctx.DPConfig.getFeatures());
  assert.equal(f.DRY_RUN, true);
  const others = Object.keys(f).filter((k) => k !== 'DRY_RUN');
  assert.ok(others.length >= 6);
  for (const k of others) assert.equal(f[k], false, k);
  assert.deepEqual(Object.keys(f).sort(), Object.keys(toHost(ctx.DPEngines.DEFAULT_FEATURES)).sort());
});

test('(d) setFeature round-trips and rejects bad input', () => {
  const ctx = setup();
  assert.equal(ctx.DPConfig.setFeature('GMAIL_ROUTER', true).GMAIL_ROUTER, true);
  assert.equal(ctx.DPConfig.getFeatures().GMAIL_ROUTER, true);
  ctx.DPConfig.setFeature('DRY_RUN', false);
  assert.equal(ctx.DPConfig.getFeatures().DRY_RUN, false);
  ctx.DPConfig.setFeature('GMAIL_ROUTER', false);
  assert.equal(ctx.DPConfig.getFeatures().GMAIL_ROUTER, false);
  assert.throws(() => ctx.DPConfig.setFeature('NOPE', true), /Unknown feature flag/);
  assert.throws(() => ctx.DPConfig.setFeature('DRY_RUN', 'yes'), /boolean/);
  assert.equal(configTab(ctx).rows.filter((r) => r[0] === 'GMAIL_ROUTER').length, 1);
});

test('getSheetUrl points at the hub Sheet', () => {
  const ctx = setup();
  const id = ctx.DPConfig.ensureSetup();
  assert.equal(ctx.DPConfig.getSheetUrl(), `https://docs.google.com/spreadsheets/d/${id}/edit`);
});

test('(i) every .gs file loads without leaking globals beyond its declared exports', () => {
  const expected = { 'Config.gs': ['DPConfig'], 'LedgerRepository.gs': ['DPLedgerRepo'], 'NotesRepository.gs': ['DPNotesRepo'] };
  const ctx = makeGasContext();
  loadEngines(ctx);
  for (const file of OWN_FILES) {
    const before = new Set(Object.getOwnPropertyNames(ctx));
    loadGasFile(ctx, file);
    const added = Object.getOwnPropertyNames(ctx).filter((n) => !before.has(n));
    assert.deepEqual(added, expected[file], file);
    assert.ok(Object.isFrozen(ctx[expected[file][0]]), `${file} export frozen`);
  }
});

test('(i) .gs files have a header, one IIFE, and no ES module syntax', () => {
  for (const file of OWN_FILES) {
    const src = fs.readFileSync(path.join(gasDir, file), 'utf8');
    assert.match(src, /^\/\*\*\n \* @file /, `${file} header`);
    assert.equal((src.match(/\(function\(global\) \{/g) || []).length, 1, `${file} IIFE`);
    assert.ok(src.trimEnd().endsWith('})(this);'), `${file} IIFE close`);
    assert.doesNotMatch(src, /^\s*(import|export)\s/m, `${file} ES module syntax`);
  }
});

test('(j) own .gs files never reference GmailApp or SpreadsheetApp', () => {
  for (const file of OWN_FILES) {
    const src = fs.readFileSync(path.join(gasDir, file), 'utf8');
    assert.doesNotMatch(src, /GmailApp|SpreadsheetApp/, file);
  }
});

// gmail.modify (2026-10-12, user decision) replaces gmail.readonly for Triage Archive/Delete. It covers reads too,
// so readonly would be redundant. Full mail (mail.google.com, permanent delete) stays banned.
test('(k) appsscript.json: valid, gmail.modify (not readonly) present, broad scopes absent, services enabled', () => {
  const m = JSON.parse(fs.readFileSync(path.join(gasDir, 'appsscript.json'), 'utf8'));
  const scopes = m.oauthScopes;
  assert.ok(scopes.includes('https://www.googleapis.com/auth/gmail.modify'));
  assert.ok(!scopes.includes('https://www.googleapis.com/auth/gmail.readonly'), 'readonly is redundant under modify');
  // gmail.settings.basic (2026-10-16, user decision): read filters and create add-label-only filters the user
  // ticks. settings.sharing (forwarding, delegates) stays out.
  assert.ok(scopes.includes('https://www.googleapis.com/auth/gmail.settings.basic'));
  for (const s of scopes) {
    assert.doesNotMatch(s, /\/auth\/spreadsheets|\/auth\/documents|mail\.google\.com|gmail\.(compose|send|insert|settings\.sharing)/, s);
  }
  assert.ok(scopes.includes('https://www.googleapis.com/auth/drive.file'));
  const svc = m.dependencies.enabledAdvancedServices;
  assert.ok(svc.some((s) => s.userSymbol === 'Sheets' && s.serviceId === 'sheets' && s.version === 'v4'));
  assert.ok(svc.some((s) => s.userSymbol === 'Gmail' && s.serviceId === 'gmail' && s.version === 'v1'));
});

function registryRows(ctx) {
  const id = ctx.PropertiesService.getUserProperties().getProperty('DP_HUB_SHEET_ID');
  return ctx.__fakes.sheets[id].tabs.find((t) => t.title === 'Meeting Registry').rows;
}

test('updateRegistryRows writes validated fields in one batch call', () => {
  const ctx = setup();
  ctx.DPConfig.ensureSetup();
  const before = ctx.__fakes.sheetsCalls.length;
  ctx.DPConfig.updateRegistryRows([{ seriesKey: 'NCMMS_CORE', fields: { RecurringEventId: 'rec123', CalendarId: 'cal@x' } }]);
  const rows = registryRows(ctx);
  const h = rows[0];
  const row = rows.find((r) => r[h.indexOf('SeriesKey')] === 'NCMMS_CORE');
  assert.equal(row[h.indexOf('RecurringEventId')], 'rec123');
  assert.equal(row[h.indexOf('CalendarId')], 'cal@x');
  const writes = ctx.__fakes.sheetsCalls.slice(before).filter((c) => /^values\.(update|batchUpdate|append)$/.test(c.method));
  assert.deepEqual(writes.map((c) => c.method), ['values.batchUpdate']);
  assert.equal(ctx.DPConfig.getRegistry().find((r) => r.SeriesKey === 'NCMMS_CORE').RecurringEventId, 'rec123');
});

test('updateRegistryRows writes several series with one read and one batch write', () => {
  const ctx = setup();
  ctx.DPConfig.ensureSetup();
  const before = ctx.__fakes.sheetsCalls.length;
  ctx.DPConfig.updateRegistryRows([
    { seriesKey: 'NCMMS_CORE', fields: { RecurringEventId: 'r1', CalendarId: 'c1' } },
    { seriesKey: 'TRM_PM', fields: { RecurringEventId: 'r2', CalendarId: 'c2' } }
  ]);
  assert.deepEqual(ctx.__fakes.sheetsCalls.slice(before).map((c) => c.method), ['values.get', 'values.batchUpdate']);
  const reg = toHost(ctx.DPConfig.getRegistry());
  assert.equal(reg.find((r) => r.SeriesKey === 'NCMMS_CORE').RecurringEventId, 'r1');
  assert.equal(reg.find((r) => r.SeriesKey === 'TRM_PM').CalendarId, 'c2');
  assert.throws(() => ctx.DPConfig.updateRegistryRows([{ seriesKey: 'NCMMS_CORE', fields: { RecurringEventId: 'x' } }, { seriesKey: 'NOPE', fields: { RecurringEventId: 'y' } }]), /NOPE/);
  assert.equal(toHost(ctx.DPConfig.getRegistry()).find((r) => r.SeriesKey === 'NCMMS_CORE').RecurringEventId, 'r1', 'validation fails before any write');
  assert.throws(() => ctx.DPConfig.updateRegistryRows('x'), /array/);
});

test('updateRegistryRows rejects unknown series, unknown columns, and SeriesKey rewrites', () => {
  const ctx = setup();
  ctx.DPConfig.ensureSetup();
  assert.throws(() => ctx.DPConfig.updateRegistryRows([{ seriesKey: 'NOPE', fields: { RecurringEventId: 'x' } }]), /NOPE/);
  assert.throws(() => ctx.DPConfig.updateRegistryRows([{ seriesKey: 'NCMMS_CORE', fields: { Bogus: 'x' } }]), /Bogus/);
  assert.throws(() => ctx.DPConfig.updateRegistryRows([{ seriesKey: 'NCMMS_CORE', fields: { SeriesKey: 'Z' } }]), /SeriesKey/);
  assert.throws(() => ctx.DPConfig.updateRegistryRows([{ seriesKey: 'NCMMS_CORE', fields: {} }]), /fields/);
});
