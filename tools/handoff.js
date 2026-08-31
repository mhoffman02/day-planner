#!/usr/bin/env node
/**
 * @file tools/handoff.js
 * @description End-of-session handoff tool: updates PLAN.md/CONTEXT.md, builds HANDOFF_PROMPT.md,
 * stages changes, runs pre-commit findings check & auto-fix, commits (triggers pre-commit linter/test hook),
 * pushes to remote origin, and copies prompt to clipboard.
 */

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const readOnly = process.argv.includes('--read-only');
const preflight = process.argv.includes('--preflight');
const completedArg = process.argv.find((a) => a.startsWith('--completed='));

/**
 * Runs a shell command in the repo root and returns its trimmed stdout, or ''
 * on failure.
 * @param {string} cmd Shell command to run.
 * @returns {string} Trimmed stdout, or '' on error.
 */
function sh(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/**
 * Copies text to the system clipboard, trying each known OS clipboard backend
 * in turn (WSL/Windows, X11 xclip/xsel, macOS pbcopy) until one succeeds.
 * @param {string} text Text to copy.
 * @returns {boolean} True if a backend accepted the copy.
 */
function toClipboard(text) {
  const buf = Buffer.from(text, 'utf8');
  const backends = [
    { cmd: 'clip.exe', args: [] },
    { cmd: 'xclip', args: ['-selection', 'clipboard'] },
    { cmd: 'xsel', args: ['--clipboard', '--input'] },
    { cmd: 'pbcopy', args: [] }
  ];
  for (const { cmd, args } of backends) {
    const r = spawnSync(cmd, args, { input: buf, stdio: ['pipe', 'ignore', 'ignore'] });
    if (r.status === 0) return true;
  }
  return false;
}

/**
 * Derives a real, one-line `@description` for the auto-injected `@file`
 * header from whatever static signal the source actually contains, since
 * this runs unattended at commit time with no LLM available to write prose.
 * Prefers the file's top-level exported symbols (matches this project's
 * `export function/class/const NAME` style — see src/taskEngine.js etc.);
 * falls back to flagging a Node CLI script by its shebang; and as a last
 * resort says so explicitly rather than emitting a description-shaped
 * sentence with no actual content, which is how the old placeholder text
 * ("Auto-generated JSDoc header for X") ended up committed as if it were
 * real documentation.
 * @param {string} content File source.
 * @returns {string} One-line description for the injected `@description` tag.
 */
function describeFileForHeader(content) {
  const exportNames = [];
  const exportRegex = /^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z0-9_$]+)/gm;
  let match;
  while ((match = exportRegex.exec(content)) !== null) {
    exportNames.push(match[1]);
  }
  if (exportNames.length > 0) {
    const shown = exportNames.slice(0, 8);
    const suffix = exportNames.length > shown.length ? ', …' : '';
    return `Exports: ${shown.join(', ')}${suffix}.`;
  }
  if (/^#!/.test(content)) {
    return 'Node CLI script — run directly, no exported API.';
  }
  return 'PLACEHOLDER: no exported symbols detected automatically — replace with a real description of this file\'s purpose.';
}

/**
 * Auto-fixes one class of pre-commit finding on currently staged .js files:
 * injects an `@file` JSDoc header — with a real, content-derived
 * `@description` (see describeFileForHeader) — into any staged, non-test,
 * non-config, non-vendor JS file that's missing one, then re-stages the
 * changes.
 * @returns {void}
 */
function autoFixFindings() {
  console.log('🧹 [FIX FINDINGS] Checking and fixing auto-fixable findings...');
  const stagedFiles = sh('git diff --cached --name-only --diff-filter=ACM').split('\n').filter(Boolean);
  const lintable = stagedFiles.filter((relPath) =>
    /\.(js|mjs)$/.test(relPath) &&
    !/(^|\/)vendor\//.test(relPath) &&
    !/\.min\.js$/.test(relPath) &&
    fs.existsSync(path.join(ROOT, relPath))
  );
  let fixedCount = 0;

  // ── ESLint auto-fix ────────────────────────────────────────────────────────
  // Purely mechanical (formatting, unused imports, etc.) — no LLM reasoning needed.
  // Whatever eslint can't fix stays as-is; the real gate is the pre-commit hook's
  // plain `eslint` check, which fails the commit loudly rather than swallowing it.
  if (lintable.length > 0) {
    const result = spawnSync('npx', ['eslint', '--fix', ...lintable], { cwd: ROOT, encoding: 'utf8' });
    if (result.status === 0) {
      console.log(`  🔧 [LINT] eslint --fix ran clean on ${lintable.length} staged file(s).`);
    } else {
      console.log(`  ⚠️ [LINT] eslint found issues it could not auto-fix:\n${(result.stdout || result.stderr || '').trim()}`);
    }
    sh('git add .');
  }

  for (const relPath of stagedFiles) {
    if (!/\.(js|mjs)$/.test(relPath) || /\.test\.js$|\.config\.js$|server\.js/.test(relPath)) {
      continue;
    }
    // Never stamp a header into vendored/minified third-party code — it isn't
    // ours to document, and a minified bundle has no meaningful top-level
    // exports for describeFileForHeader to find anyway.
    if (/(^|\/)vendor\//.test(relPath) || /\.min\.js$/.test(relPath)) {
      continue;
    }
    const fullPath = path.join(ROOT, relPath);
    if (!fs.existsSync(fullPath)) continue;

    let content = fs.readFileSync(fullPath, 'utf8');
    if (!/@file|@module/.test(content)) {
      console.log(`  🔧 [HIGH] Auto-injecting missing @file JSDoc header into: ${relPath}`);
      const filename = path.basename(relPath);
      const description = describeFileForHeader(content);
      const jsdocHeader = `/**\n * @file ${filename}\n * @description ${description}\n */\n\n`;
      fs.writeFileSync(fullPath, jsdocHeader + content, 'utf8');
      fixedCount++;
    }
  }

  if (fixedCount > 0) {
    console.log(`✅ [FIX FINDINGS] Automatically resolved ${fixedCount} finding(s). Re-staging files...`);
    sh('git add .');
  } else {
    console.log('✅ [FIX FINDINGS] No auto-fixable findings detected.');
  }
}

/**
 * Fast, side-effect-free status check for the `/handoff` command to branch on before
 * spending tokens on `npm test` / `/code-review` — e.g. a session that made no changes
 * (NOOP) or only touched docs (SKIP_REVIEW) doesn't need either.
 * @returns {void}
 */
function runPreflight() {
  const changed = sh('git status --porcelain').split('\n').filter(Boolean)
    .map((line) => line.slice(3));
  const noop = changed.length === 0;
  const docsOnly = !noop && changed.every((f) => /\.(md|txt)$/.test(f));
  console.log(`NOOP: ${noop}`);
  console.log(`FILES_CHANGED: ${changed.length}`);
  console.log(`SKIP_REVIEW: ${noop || docsOnly}`);
  if (changed.length > 0) console.log(`FILES:\n${changed.map((f) => `  ${f}`).join('\n')}`);
}

/**
 * Scripted stand-in for hand-reconciling `PLAN.md`: flips each `- [ ]` line whose text
 * contains one of the given (session TodoWrite) titles as a case-insensitive substring
 * to `- [x]`, and reports any titles that matched no open line so the LLM only has to
 * reason about those, not the whole file.
 * @param {string} titlesArg Pipe-separated list of completed TodoWrite titles.
 * @returns {void}
 */
function reconcilePlan(titlesArg) {
  const titles = titlesArg.split('|').map((t) => t.trim()).filter(Boolean);
  const planPath = path.join(ROOT, 'PLAN.md');
  if (!fs.existsSync(planPath)) {
    console.log('PLAN.md not found — nothing to reconcile.');
    return;
  }
  const lines = fs.readFileSync(planPath, 'utf8').split('\n');
  const unmatched = [];
  for (const title of titles) {
    const idx = lines.findIndex((l) => /^\s*-\s\[ \]/.test(l) && l.toLowerCase().includes(title.toLowerCase()));
    if (idx === -1) {
      unmatched.push(title);
      continue;
    }
    lines[idx] = lines[idx].replace('- [ ]', '- [x]');
    console.log(`  ✅ Checked off: ${lines[idx].trim()}`);
  }
  fs.writeFileSync(planPath, lines.join('\n'), 'utf8');
  if (unmatched.length > 0) {
    console.log(`UNMATCHED (reconcile by hand): ${unmatched.join(' | ')}`);
  } else {
    console.log('All completed items matched an open PLAN.md line.');
  }
}

if (preflight) {
  runPreflight();
  process.exit(0);
}

if (completedArg) {
  reconcilePlan(completedArg.slice('--completed='.length));
  process.exit(0);
}

// 1. Gather git and project state
const branch = sh('git rev-parse --abbrev-ref HEAD') || 'master';
const lastCommit = sh('git log -1 --oneline') || 'no commits';
const now = new Date();
const dateStr = now.toISOString().slice(0, 10);
const timestamp = now.toISOString();

// 2. Read open PLAN.md items
const planPath = path.join(ROOT, 'PLAN.md');
let openItems = [];
if (fs.existsSync(planPath)) {
  const lines = fs.readFileSync(planPath, 'utf8').split('\n');
  openItems = lines.filter((l) => /^\s*-\s\[ \]/.test(l)).map((l) => l.trim());
}

// 3. Update CONTEXT.md & HANDOFF_PROMPT.md BEFORE git commit/push
const contextContent = [
  '# Session Context',
  '',
  `Generated: ${timestamp}`,
  `Branch: ${branch}`,
  `Last commit: ${lastCommit}`,
  `Uncommitted files: 0`,
  '',
  '## Open PLAN.md items',
  openItems.length ? openItems.join('\n') : '_None — PLAN.md fully checked off._',
  ''
].join('\n');

const handoffPrompt = `# Session Handoff & Continuation Prompt — ${dateStr}

**Generated**: ${timestamp}
**Branch**: ${branch}
**Last Commit**: ${lastCommit}

## Project Overview & Current Architecture
The **Day Planner** project is a standalone digital binder application styled in classic Day Planner aesthetic (Parchment \`#fcfbfa\`, Teal \`#2d6a5a\`, serif headers).
- Standalone SPA files: \`index.html\`, \`src/styles.css\`, \`src/app.js\`, \`src/gasBridge.js\`
- All 41 unit tests pass cleanly (\`npm test\`).
- Local server: \`npm start\` (\`http://localhost:3000\`).

## Recent Session Work & Commits
${lastCommit}

## Open Checklist Items (PLAN.md)
${openItems.length ? openItems.join('\n') : '_None — PLAN.md fully checked off._'}

## Next Steps for Continuing Session
1. Run \`npm start\` to start local server (\`http://localhost:3000\`).
2. Run \`npm test\` to execute unit tests.
3. Continue planned feature development or UI enhancements per \`PLAN.md\`.
`;

if (!readOnly) {
  fs.writeFileSync(path.join(ROOT, 'CONTEXT.md'), contextContent, 'utf8');
  fs.writeFileSync(path.join(ROOT, 'HANDOFF_PROMPT.md'), handoffPrompt, 'utf8');
}

// 4. Perform Git Add, Fix Findings, Commit (runs linter hook), and Push
const dirtyFiles = sh('git status --porcelain').split('\n').filter(Boolean);

if (!readOnly) {
  if (dirtyFiles.length > 0) {
    console.log('📦 Step 1: Staging working tree changes (git add .)...');
    sh('git add .');

    console.log('🧹 Step 1.5: [FIX FINDINGS] Running linter / findings review & auto-fix...');
    autoFixFindings();

    console.log('🔧 Step 2: Committing changes (triggers pre-commit linter & unit tests)...');
    try {
      execSync(`git commit -m ${JSON.stringify(`docs(handoff): session handoff update ${dateStr}`)}`, {
        cwd: ROOT,
        stdio: 'inherit'
      });
      console.log('✅ Commit successful.');
    } catch (err) {
      console.error('❌ [BLOCKER] Pre-commit hook or commit failed. Please fix remaining findings and re-run.', err.message);
      process.exit(1);
    }

    console.log('🚀 Step 3: Pushing commits to remote origin...');
    try {
      execSync('git push origin ' + branch, { cwd: ROOT, stdio: 'inherit' });
      console.log('✅ Push successful.');
    } catch (pushErr) {
      console.warn('⚠️ Push to remote failed or remote unavailable. Continuing local handoff.', pushErr.message);
    }
  } else {
    console.log('ℹ️ Working tree is clean. Skipping git commit & push.');
  }
}

// 5. Copy to clipboard
const clipped = toClipboard(handoffPrompt);

// 6. Output user guidance
console.log('\n==================================================');
if (clipped) {
  console.log('📋 Handoff prompt copied to clipboard!');
} else {
  console.log('⚠️ Clipboard copy unavailable. Prompt written to HANDOFF_PROMPT.md.');
}
console.log('📄 Prompt file: HANDOFF_PROMPT.md');
console.log('--------------------------------------------------');
console.log('👉 Issue "/new" command to start next session.');
console.log('👉 Then PASTE clipboard into the next session to resume work.');
console.log('==================================================\n');
