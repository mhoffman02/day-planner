#!/usr/bin/env node
/**
 * @file tools/stamp-build-number.js
 * @description Rewrites the DAY_PLANNER_BUILD_NUMBER literal in gas-app/Code.gs to the current
 * git commit count, so the number shown in the app (About page, top nav hover) reflects the code
 * actually being shipped. Run before a real deploy (clasp push), not on every commit.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const file = path.join('gas-app', 'Code.gs');
const count = parseInt(execSync('git rev-list --count HEAD').toString().trim(), 10);

const src = fs.readFileSync(file, 'utf8');
const re = /const DAY_PLANNER_BUILD_NUMBER = \d+;/;
if (!re.test(src)) {
  console.error(`DAY_PLANNER_BUILD_NUMBER literal not found in ${file}`);
  process.exit(1);
}

const updated = src.replace(re, `const DAY_PLANNER_BUILD_NUMBER = ${count};`);
if (updated === src) {
  console.log(`DAY_PLANNER_BUILD_NUMBER already ${count} in ${file} — nothing to do.`);
} else {
  fs.writeFileSync(file, updated);
  console.log(`Stamped DAY_PLANNER_BUILD_NUMBER = ${count} in ${file}`);
}
