#!/usr/bin/env node

/**
 * Promote vetted code from HOME (master) to WORK (Federal GSA environment).
 * 
 * Safety invariants:
 * 1. Runs lint and unit tests first.
 * 2. Never mutates gas-app/.clasp.json (HOME remains untouched).
 * 3. Uses gas-app/.clasp-work.json (Script ID 1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq).
 * 4. Checks authentication before attempting push.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const GAS_APP_DIR = path.join(ROOT_DIR, 'gas-app');
const WORK_CONFIG = path.join(GAS_APP_DIR, '.clasp-work.json');
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '';
const WORK_AUTH = path.join(HOME_DIR, '.clasprc.work.json');
const DEFAULT_AUTH = path.join(HOME_DIR, '.clasprc.json');

const WORK_SCRIPT_ID = '1980roEKgkC_3yMOrPLcwVcAODjAtz6wGPF4fbHqLDAhchQQaH_bVpMDq';

console.log('⚡ Day Planner Promotion: HOME (Master) -> WORK (Federal)');
console.log('======================================================');

// 1. Verify WORK clasp config exists
if (!fs.existsSync(WORK_CONFIG)) {
  console.error('❌ Missing gas-app/.clasp-work.json');
  process.exit(1);
}

// 2. Pre-flight checks
console.log('\n[1/3] Running pre-flight quality checks...');
try {
  console.log('  -> Running linter & safe-character guard...');
  execSync('npm run lint', { cwd: ROOT_DIR, stdio: 'inherit' });
  console.log('  -> Running unit tests...');
  execSync('npm test', { cwd: ROOT_DIR, stdio: 'inherit' });
  console.log('  ✓ Pre-flight checks passed.');
} catch {
  console.error('❌ Pre-flight checks failed. Aborting promotion to WORK.');
  process.exit(1);
}

// 3. Determine Auth Configuration
console.log('\n[2/3] Checking authentication...');
let authFlag = '';
if (fs.existsSync(WORK_AUTH)) {
  authFlag = `--auth "${WORK_AUTH}"`;
  console.log(`  -> Using dedicated WORK auth file: ${WORK_AUTH}`);
} else {
  console.log(`  -> Checking default clasp auth: ${DEFAULT_AUTH}`);
}

// Check if current auth can access the WORK script
let canAccess;
try {
  execSync(`npx clasp ${authFlag} deployments "${WORK_SCRIPT_ID}"`, {
    cwd: GAS_APP_DIR,
    stdio: 'pipe',
  });
  canAccess = true;
  console.log('  ✓ Authenticated and authorized to access Day-Planner-WORK.');
} catch {
  canAccess = false;
}

if (!canAccess) {
  console.error('\n❌ Permission denied: Current clasp credentials cannot access the WORK script.');
  console.error('\nTo authorize access, choose either of these two quick options:');
  console.error('\n--- OPTION A (Fastest - Share from GSA) ---');
  console.error('1. Open WORK script in your browser (signed in as michael.hoffman@gsa.gov):');
  console.error(`   https://script.google.com/d/${WORK_SCRIPT_ID}/edit`);
  console.error('2. Click "Share" (top-right) and add mhoffman02@gmail.com as Editor.');
  console.error('3. Re-run: npm run push:work\n');
  console.error('--- OPTION B (Dedicated Work Login) ---');
  console.error('1. Run: npm run login:work');
  console.error('2. Log in with your michael.hoffman@gsa.gov account when the browser opens.');
  console.error('3. Re-run: npm run push:work\n');
  process.exit(1);
}

// 4. Push to WORK
console.log('\n[3/3] Pushing vetted code to Day-Planner-WORK...');
try {
  execSync(`npx clasp ${authFlag} --project "${WORK_CONFIG}" push --force`, {
    cwd: GAS_APP_DIR,
    stdio: 'inherit',
  });
  console.log('\n  -> Creating version on WORK...');
  try {
    const versionOutput = execSync(`npx clasp ${authFlag} --project "${WORK_CONFIG}" version "v1.0-pure-gas update"`, {
      cwd: GAS_APP_DIR,
      stdio: 'pipe'
    }).toString().trim();
    console.log(`  ✓ ${versionOutput}`);
  } catch (vErr) {
    console.log('  ℹ️ Note: version creation skipped:', vErr.message);
  }
  console.log('\n======================================================');
  console.log('🎉 Successfully pushed code to WORK (Federal GSA)!');
  console.log('   Target Deployment:  Version 3 (deployId ending in 9csO)');
  console.log('   WORK 9csO Endpoint: https://script.google.com/a/macros/gsa.gov/s/AKfycbzRwZFZH9bT5jQtqq0ncBPbokoQGKjSUyBQNVDtPpOISwtdMSXlNAns8E9WFtUM9csO/exec');
  console.log('   WORK IDE:           https://script.google.com/d/' + WORK_SCRIPT_ID + '/edit');
  console.log('======================================================');
} catch (pushErr) {
  console.error('❌ Failed to push code to WORK:', pushErr.message);
  process.exit(1);
}
