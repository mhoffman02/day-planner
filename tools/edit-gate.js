#!/usr/bin/env node
/**
 * @file Edit-time gate for the Claude Code PostToolUse hook (.claude/settings.json). Reads the hook JSON on
 * stdin, runs the cheap checks that apply to the edited file, and exits 2 with the findings on stderr so they
 * reach the agent while it is still editing. Pre-commit and CI remain the enforcing layers.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** @param {string} file @returns {string[][]} argv lists to run, none when the file has no cheap check */
export function pickChecks(file) {
  const checks = [];
  if (/\.(js|gs)$/.test(file) || /gas-app\/[^/]*\.html$/.test(file)) checks.push(['npx', 'eslint', file]);
  if (/\.css$/.test(file) || /gas-app\/Styles\.html$/.test(file)) checks.push(['node', 'tools/check-css.js']);
  return checks;
}

function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const file = input.tool_input?.file_path;
  if (!file) return;
  const failures = [];
  for (const [cmd, ...args] of pickChecks(file)) {
    try {
      execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', timeout: 60000 });
    } catch (err) {
      console.error(`edit-gate: ${cmd} ${args.join(' ')} failed`, err.stack);
      failures.push(`${err.stdout ?? ''}${err.stderr ?? ''}`.trim() || err.message);
    }
  }
  if (failures.length) {
    process.stderr.write(`${failures.join('\n')}\n`);
    process.exit(2);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
