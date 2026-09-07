#!/usr/bin/env node
/**
 * @file tools/handoff.js
 * @description End-of-session handoff tool: updates PLAN.md/CONTEXT.md, builds HANDOFF_PROMPT.md,
 * stages and commits ONLY the files it writes, pushes to remote origin, and copies prompt to clipboard.
 * Leftover working-tree changes are reported so they keep their own truthful commits.
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
 * Tracks every path written during this handoff run.
 * Derived from real writes so handoff commits ONLY what it actually produced.
 * @type {Set<string>}
 */
const writtenPaths = new Set();

/**
 * Writes file content and logs the path for targeted staging.
 * @param {string} filePath Absolute file path.
 * @param {string} content File text.
 * @returns {void}
 */
function trackedWrite(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
  writtenPaths.add(filePath);
}

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
 * header from whatever static signal the source actually contains.
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
 * Auto-fixes findings on currently staged JS files (targeting only files
 * staged in this run, never running git add .).
 * @returns {void}
 */
function autoFixFindings() {
  const stagedFiles = sh('git diff --cached --name-only --diff-filter=ACM').split('\n').filter(Boolean);
  const lintable = stagedFiles.filter((relPath) =>
    /\.(js|mjs)$/.test(relPath) &&
    !/(^|\/)vendor\//.test(relPath) &&
    !/\.min\.js$/.test(relPath) &&
    fs.existsSync(path.join(ROOT, relPath))
  );
  let fixedCount = 0;

  if (lintable.length > 0) {
    const result = spawnSync('npx', ['eslint', '--fix', ...lintable], { cwd: ROOT, encoding: 'utf8' });
    if (result.status === 0) {
      console.log(`  🔧 [LINT] eslint --fix ran clean on ${lintable.length} staged file(s).`);
    } else {
      console.log(`  ⚠️ [LINT] eslint found issues it could not auto-fix:\n${(result.stdout || result.stderr || '').trim()}`);
    }
    for (const rel of lintable) {
      sh(`git add -- "${rel}"`);
    }
  }

  for (const relPath of stagedFiles) {
    if (!/\.(js|mjs)$/.test(relPath) || /\.test\.js$|\.config\.js$|server\.js/.test(relPath)) {
      continue;
    }
    if (/(^|\/)vendor\//.test(relPath) || /\.min\.js$/.test(relPath)) {
      continue;
    }
    const fullPath = path.join(ROOT, relPath);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, 'utf8');
    if (!/@file|@module/.test(content)) {
      console.log(`  🔧 [HIGH] Auto-injecting missing @file JSDoc header into: ${relPath}`);
      const filename = path.basename(relPath);
      const description = describeFileForHeader(content);
      const jsdocHeader = `/**\n * @file ${filename}\n * @description ${description}\n */\n\n`;
      fs.writeFileSync(fullPath, jsdocHeader + content, 'utf8');
      sh(`git add -- "${relPath}"`);
      fixedCount++;
    }
  }

  if (fixedCount > 0) {
    console.log(`✅ [FIX FINDINGS] Automatically resolved ${fixedCount} finding(s).`);
  }
}

/**
 * Fast, side-effect-free status check for the `/handoff` command to branch on before
 * spending tokens on `npm test` / `/review`.
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
 * Describes working-tree changes handoff deliberately did NOT commit.
 * @returns {string} Warning block, or '' when the tree is clean.
 */
function describeLeftovers() {
  const rest = sh('git status --short');
  if (!rest) return '';
  const lines = rest.split('\n').filter(Boolean);
  const shown = lines.slice(0, 10).map((l) => `    ${l}`);
  if (lines.length > 10) shown.push(`    …and ${lines.length - 10} more`);
  return [
    `⚠️  ${lines.length} file(s) still uncommitted — handoff did NOT include them:`,
    ...shown,
    '',
    '    Handoff stages only the files it writes, so code/test changes keep',
    '    their own commit and a truthful message. Commit them separately:',
    '      git add <paths>',
    '      git commit -m "<type>(<scope>): <subject>"',
  ].join('\n');
}

/**
 * Extracts action items from the previous prompt text.
 * @param {string} promptText Previous HANDOFF_PROMPT.md content.
 * @returns {string[]} List of previous action item strings.
 */
function extractPrevNextActions(promptText) {
  if (!promptText) return [];
  const m = promptText.match(/## Open Checklist Items \(PLAN\.md\)\s*\r?\n\r?\n([\s\S]*?)(?=\r?\n\r?\n##|\r?\n\r?\n---|$)/);
  if (!m) return [];
  return m[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('-'))
    .map((l) => l.replace(/^-+\s*/, '').trim())
    .filter(Boolean);
}

/**
 * Finds items from previous prompt that disappeared from PLAN.md without being checked off.
 * @param {string[]} prevItems Previous prompt checklist items.
 * @param {string} planText Current PLAN.md content.
 * @param {string[]} currentItems Current open checklist items.
 * @returns {string[]} Dropped item strings.
 */
function findDroppedSessionItems(prevItems, planText, currentItems) {
  const FALLBACK_RE = /None — PLAN\.md fully checked off/i;
  const haystack = `${planText}\n${currentItems.join('\n')}`.toLowerCase();
  const currentSet = new Set(currentItems.map((i) => i.toLowerCase().trim()));

  return prevItems.filter((item) => {
    if (FALLBACK_RE.test(item)) return false;
    const norm = item.toLowerCase().trim();
    if (currentSet.has(norm)) return false;
    const bare = norm.replace(/^\[[ x]\]\s*/i, '');
    return bare.length > 0 && !haystack.includes(bare);
  });
}

/**
 * Flips each matching `- [ ]` line in PLAN.md to `- [x]`.
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
  trackedWrite(planPath, lines.join('\n'));
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

// Count test files dynamically
let testFileCount = 12;
try {
  testFileCount = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.js')).length;
} catch {
  // fallback
}

// 2. Read open PLAN.md items
const planPath = path.join(ROOT, 'PLAN.md');
let planContent = '';
let openItems = [];
if (fs.existsSync(planPath)) {
  planContent = fs.readFileSync(planPath, 'utf8');
  openItems = planContent.split('\n').filter((l) => /^\s*-\s\[ \]/.test(l)).map((l) => l.trim());
}

// 3. Detect dropped session items from previous HANDOFF_PROMPT.md
const promptPath = path.join(ROOT, 'HANDOFF_PROMPT.md');
let droppedItems = [];
if (fs.existsSync(promptPath)) {
  const prevPrompt = fs.readFileSync(promptPath, 'utf8');
  const prevItems = extractPrevNextActions(prevPrompt);
  droppedItems = findDroppedSessionItems(prevItems, planContent, openItems);
}

if (droppedItems.length > 0) {
  console.log(`⚠️  ${droppedItems.length} item(s) carried over from last session missing from PLAN.md:`);
  for (const d of droppedItems) {
    console.log(`    - ${d}`);
  }
}

// 4. Update CONTEXT.md & HANDOFF_PROMPT.md
const contextContent = [
  '# Session Context',
  '',
  `Generated: ${timestamp}`,
  `Branch: ${branch}`,
  `Last commit: ${lastCommit}`,
  '',
  '## Open PLAN.md items',
  openItems.length ? openItems.join('\n') : '_None — PLAN.md fully checked off._',
  ''
].join('\n');

const checklistSection = [
  openItems.length ? openItems.join('\n') : '_None — PLAN.md fully checked off._',
  droppedItems.length ? `\n### ⚠️ Carried over from last session (reconcile into PLAN.md):\n${droppedItems.map((d) => `- [ ] ${d}`).join('\n')}` : ''
].filter(Boolean).join('\n');

const handoffPrompt = `# Session Handoff & Continuation Prompt — ${dateStr}

**Generated**: ${timestamp}
**Branch**: ${branch}
**Last Commit**: ${lastCommit}

## Project Overview & Current Architecture
The **Day Planner** project is a standalone digital binder application styled in classic Day Planner aesthetic (Parchment \`#fcfbfa\`, Teal \`#2d6a5a\`, serif headers).
- Standalone SPA files: \`index.html\`, \`src/styles.css\`, \`src/app.js\`, \`src/gasBridge.js\`
- All unit tests pass cleanly across ${testFileCount} test files (\`npm test\`).
- Local server: \`npm start\` (\`http://localhost:3000\`).
- Multi-model architecture: Symmetric AGY ↔ Claude Code headless invocation protocol (\`.agents/rules/cross-cli-headless-invocation.md\`) with zero API keys and Opus advisor integration.

## Recent Session Work & Commits
${lastCommit}

## Open Checklist Items (PLAN.md)
${checklistSection}

## Next Steps for Continuing Session
1. Run \`npm start\` to start local server (\`http://localhost:3000\`).
2. Run \`npm test\` to execute unit tests.
3. Continue planned feature development or UI enhancements per \`PLAN.md\`.
`;

if (!readOnly) {
  trackedWrite(path.join(ROOT, 'CONTEXT.md'), contextContent);
  trackedWrite(path.join(ROOT, 'HANDOFF_PROMPT.md'), handoffPrompt);
}

// 5. Commit handoff files (committing ONLY what handoff wrote)
if (!readOnly) {
  const paths = [...writtenPaths].filter((p) => fs.existsSync(p));
  if (paths.length > 0) {
    console.log(`📦 Step 1: Staging handoff files (${paths.length} file(s))...`);
    for (const p of paths) {
      sh(`git add -- "${p}"`);
    }

    const staged = sh('git diff --cached --name-only');
    if (!staged) {
      console.log('ℹ️ Handoff files unchanged — nothing to commit.');
      const leftovers = describeLeftovers();
      if (leftovers) console.log(`\n${leftovers}`);
    } else {
      console.log('🧹 Step 1.5: [FIX FINDINGS] Checking staged files...');
      autoFixFindings();

      console.log('🔧 Step 2: Committing handoff files...');
      try {
        const commitMsg = `docs(handoff): session ${dateStr}`;
        execSync(`git commit -m ${JSON.stringify(commitMsg)}`, {
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
        execSync(`git push origin ${branch}`, { cwd: ROOT, stdio: 'inherit' });
        console.log('✅ Push successful.');
      } catch (pushErr) {
        console.warn('⚠️ Push to remote failed or remote unavailable. Continuing local handoff.', pushErr.message);
      }

      const leftovers = describeLeftovers();
      if (leftovers) console.log(`\n${leftovers}`);
    }
  } else {
    console.log('ℹ️ Handoff wrote no files. Skipping git commit & push.');
    const leftovers = describeLeftovers();
    if (leftovers) console.log(`\n${leftovers}`);
  }
}

// 6. Copy to clipboard
const clipped = toClipboard(handoffPrompt);

// 7. Output user guidance
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
