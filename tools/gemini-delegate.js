#!/usr/bin/env node
/**
 * @file tools/gemini-delegate.js
 * @description General-purpose wrapper for delegating bulk/mechanical, low-judgment
 * subtasks (file-tree exploration, bulk file reads, summarization, git-log digests, and
 * image/PDF/office-doc analysis — screenshots, scanned PDFs, Word/Excel content) to a
 * cheap/fast Gemini model via the `agy` CLI, instead of doing them inline or spawning a
 * full-cost Claude subagent for them.
 *
 * Adapted from ~/projects/trip-planner/tools/gemini-prebake.js (same spawnSync/executable-
 * discovery pattern), generalized from diff-pre-baking specifically to an arbitrary `--task`,
 * and switched to `--output-format json` (structured status/response/usage) instead of that
 * file's raw-stdout parsing. The `--file` (image/PDF/office-doc) path is a simplification of
 * ~/projects/maximo-uat/tools/vision.js's pattern (base64-encode + POST to a usai-proxy HTTP
 * endpoint running gemini-2.5-flash) — `agy` reads a multimodal file itself once pointed at its
 * directory via `--add-dir`, so no base64 encoding, no separate HTTP client, and no second
 * dependency chain (usai-proxy/USAI_API_KEY) beyond the one `agy` already needs. Kept as one
 * module/one skill rather than a parallel vision-specific pair, since both paths are the same
 * underlying "hand agy a bounded task and read its answer back" mechanism.
 *
 * See ../.agents/skills/gemini-delegate/SKILL.md for the decision rule on when to use this.
 *
 * Usage:
 *   node tools/gemini-delegate.js --task "<description>" [--dirs a,b,c] [--model <id>]
 *     [--input-file <path> | --file <image-or-doc-path>] [--min-chars <n>] [--raw] [--verbose]
 *   node tools/gemini-delegate.js --history [n]       # list the n (default 10) most recent
 *                                                      # invocations, newest first — plain JS,
 *                                                      # no agy call
 *   node tools/gemini-delegate.js --history-summary [n]  # same list, plus JS-computed counts
 *                                                         # (OK/FAIL/SKIP) and, only once the
 *                                                         # log is big enough to be worth it, a
 *                                                         # short agy-generated pattern summary
 *
 * Exit codes: 0 on success, 1 on failure (agy not found, call failed, or malformed response),
 * 2 when --min-chars gating skipped the call (not an error — the caller should treat this as
 * "handle it yourself, the input was too small to be worth delegating"). --file always bypasses
 * the size gate (there's no text length to measure against — the task itself, "look at this
 * file," is inherently worth a delegated call).
 *
 * Every call to `delegateToGemini()` (OK, FAIL, or SKIP — not just from this CLI) appends one
 * ≤80-char line to `gemini-delegate.log` next to this file — timestamp, status, input, output,
 * task, in that order. `--history`/`--history-summary` read it back. This is unconditional by
 * design: `delegateToGemini()` is the only exported way to reach `agy`, and it always gates
 * and always logs, so there's no lower-level path a caller could use to delegate silently.
 */

import { spawnSync, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Cheapest/fastest tier confirmed available via `agy models` this session (2026-09-18).
export const DEFAULT_MODEL = 'gemini-3.7-flash-low'
export const DELEGATE_MIN_CHARS_DEFAULT = 1200 // same threshold trip-planner's gemini-prebake.js uses
export const MAX_INPUT_CHARS = 120000 // same truncation bound as gemini-prebake.js

/**
 * Locates the `agy` executable. Returns null (never throws) if not found, so callers can
 * gracefully fall back to doing the task themselves instead of crashing.
 */
export function findAgyExecutable() {
  const candidates = [
    'agy',
    `${process.env.HOME || ''}/.local/bin/agy`,
    '/usr/local/bin/agy',
  ]
  for (const cand of candidates) {
    try {
      const resolved = execSync(`which ${cand} 2>/dev/null`, { encoding: 'utf8' }).trim()
      if (resolved && fs.existsSync(resolved)) return resolved
    } catch {
      // try next candidate
    }
  }
  return null
}

/**
 * Size gate — mirrors gemini-prebake.js's shouldPrebake(). agy has a large fixed per-call
 * token overhead (confirmed ~13.7k input tokens even for a trivial prompt this session), so
 * delegating a small task usually costs more than it saves. Only delegate when the input is
 * actually large enough (or the caller explicitly forces it) for the round-trip to pay off.
 */
export function shouldDelegate({ inputContent = '', force = false, minChars = DELEGATE_MIN_CHARS_DEFAULT } = {}) {
  if (force) return true
  return inputContent.length >= minChars
}

// ── Run log ──────────────────────────────────────────────────────────────────────────────
// One 80-char-or-less line per invocation: timestamp, status, input, output, task.
// Deliberately plain text (not JSON) — greppable, and `--history`/`--history-summary` below
// read it back with plain JS.

export const LOG_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'gemini-delegate.log')

function truncate(str, max) {
  const s = String(str || '').replace(/\s+/g, ' ').trim()
  return s.length > max ? s.slice(0, Math.max(0, max - 1)) + '…' : s
}

function formatLogLine({ status, inputDesc, outputDesc, task }) {
  const ts = new Date().toISOString().slice(5, 16) // "MM-DDTHH:MM", no embedded space — keeps the line one token-parseable per field
  const prefix = `${ts} ${status.padEnd(4)} in=${inputDesc} out=${outputDesc} :: `
  const taskBudget = Math.max(0, 80 - prefix.length)
  return truncate(prefix + truncate(task, taskBudget), 80)
}

function appendLog(fields) {
  try {
    fs.appendFileSync(LOG_PATH, formatLogLine(fields) + '\n')
  } catch {
    // best-effort only — a logging failure must never break the actual delegation
  }
}

/** The actual agy call — no gate check, no logging. Private: every real caller goes through
 * delegateToGemini() below instead, which is the only exported way to reach this. There is no
 * legitimate reason to call agy without also gating and logging it, so there's no public path
 * that skips either. */
function callAgy({ task, dirs, model, inputContent, verbose }) {
  const agyBin = findAgyExecutable()
  if (!agyBin) {
    if (verbose) console.warn('gemini-delegate: agy CLI not found on PATH — skipping delegation.')
    return null
  }

  const prompt = inputContent
    ? `${task}\n\n---\n${inputContent.slice(0, MAX_INPUT_CHARS)}`
    : task

  const args = ['--model', model, '--output-format', 'json', `--print=${prompt}`, '--dangerously-skip-permissions']
  for (const dir of dirs) args.push('--add-dir', dir)

  if (verbose) console.warn(`gemini-delegate: dispatching to ${model} via ${agyBin}...`)

  const startTime = Date.now()
  const res = spawnSync(agyBin, args, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 60000,
  })
  const elapsedMs = Date.now() - startTime

  if (res.error || res.status !== 0 || !res.stdout) {
    if (verbose) console.warn('gemini-delegate: call failed:', res.error || res.stderr || `exit ${res.status}`)
    return null
  }

  let parsed
  try {
    parsed = JSON.parse(res.stdout)
  } catch (err) {
    if (verbose) console.warn('gemini-delegate: malformed JSON response:', err.message)
    return null
  }

  if (parsed.status !== 'SUCCESS' || typeof parsed.response !== 'string') {
    if (verbose) console.warn('gemini-delegate: non-success response:', parsed.status)
    return null
  }

  return { ...parsed, elapsedMs }
}

/**
 * The one entry point for delegating to Gemini. Always gates (shouldDelegate()) and always
 * logs (SKIP/FAIL/OK) — there is no lower-level exported function that skips either, so no
 * caller can accidentally delegate without it showing up in `--history`. Returns
 * `{ skipped, result }`: `result` is the agy response object on success, `null` on a skip or
 * a failure (told apart by `skipped`). `logTask` defaults to `task` (the CLI's own usage: the
 * --task text doubles as its own log label) — pass it explicitly when the actual delegation
 * prompt is long and a short label reads better in `--history` than a multi-sentence
 * instruction truncated mid-word (e.g. "sniff-test tracker docs").
 */
export function delegateToGemini({
  task = '',
  logTask = task,
  dirs = [],
  model = DEFAULT_MODEL,
  inputContent = '',
  inputDesc,
  force = false,
  minChars = DELEGATE_MIN_CHARS_DEFAULT,
  verbose = false,
} = {}) {
  const desc = inputDesc || (inputContent ? `text:${inputContent.length}c` : 'task-only')

  if (!shouldDelegate({ inputContent, force, minChars })) {
    appendLog({ status: 'SKIP', inputDesc: desc, outputDesc: `skip(<${minChars}c)`, task: logTask })
    return { skipped: true, result: null }
  }

  const result = callAgy({ task, dirs, model, inputContent, verbose })
  if (!result) {
    appendLog({ status: 'FAIL', inputDesc: desc, outputDesc: 'fail', task: logTask })
    return { skipped: false, result: null }
  }

  appendLog({ status: 'OK', inputDesc: desc, outputDesc: `${result.response.length}c/${result.elapsedMs}ms`, task: logTask })
  return { skipped: false, result }
}

// ── History — Step 3: JS does the listing/stats; Gemini only narrates when there's enough
// volume for a pattern to be worth summarizing (same size gate as a normal delegation).

function computeStats(lines) {
  const counts = { OK: 0, FAIL: 0, SKIP: 0 }
  for (const line of lines) {
    const status = line.split(' ')[1]
    if (counts[status] !== undefined) counts[status]++
  }
  return { total: lines.length, counts, first: lines[0], last: lines[lines.length - 1] }
}

function printHistory({ count = 10, summary = false, model = DEFAULT_MODEL, verbose = false } = {}) {
  if (!fs.existsSync(LOG_PATH)) {
    console.log('gemini-delegate: no invocation history yet (log file not found).')
    return
  }
  const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean)
  if (lines.length === 0) {
    console.log('gemini-delegate: log file exists but is empty.')
    return
  }

  if (summary) {
    const stats = computeStats(lines)
    console.log(`Invocation history: ${stats.total} calls (OK=${stats.counts.OK} FAIL=${stats.counts.FAIL} SKIP=${stats.counts.SKIP})`)
    console.log(`Range: ${stats.first.split(' ')[0]} .. ${stats.last.split(' ')[0]}`)
    console.log('')
  }

  const recent = lines.slice(-count).reverse()
  console.log(`Most recent ${recent.length} invocation(s):`)
  for (const line of recent) console.log('  ' + line)

  if (summary) {
    const logContent = lines.join('\n')
    const { skipped, result } = delegateToGemini({
      task:
        'This is a tool-invocation log, one line per call (timestamp, status, input, output, ' +
        'task). In 2-4 sentences: what kinds of tasks are delegated most, the rough success ' +
        'rate, and anything notable (e.g. a task type that keeps failing or getting skipped).',
      logTask: 'history pattern summary',
      model,
      inputContent: logContent,
      verbose,
    })
    if (result) {
      console.log(`\nPattern summary (via ${model}):`)
      console.log(result.response.trim())
    } else if (verbose) {
      console.warn(skipped
        ? 'gemini-delegate: not enough history yet for a narrative summary — counts above still stand on their own.'
        : 'gemini-delegate: history narrative unavailable (agy call failed) — counts above still stand on their own.')
    }
  }
}

// ── CLI entry point ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { dirs: [], force: false, raw: false, verbose: false, minChars: DELEGATE_MIN_CHARS_DEFAULT }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--task') out.task = argv[++i]
    else if (a === '--dirs') out.dirs = argv[++i].split(',').filter(Boolean)
    else if (a === '--model') out.model = argv[++i]
    else if (a === '--input-file') out.inputFile = argv[++i]
    else if (a === '--file') out.file = argv[++i]
    else if (a === '--min-chars') out.minChars = Number(argv[++i])
    else if (a === '--force') out.force = true
    else if (a === '--raw') out.raw = true
    else if (a === '--verbose' || a === '-v') out.verbose = true
    else if (a === '--history') {
      out.history = true
      const next = argv[i + 1]
      if (next && /^\d+$/.test(next)) { out.historyCount = Number(next); i++ }
    }
    else if (a === '--history-summary') out.history = out.historySummary = true
  }
  return out
}

if (process.argv[1] && process.argv[1].endsWith('gemini-delegate.js')) {
  const opts = parseArgs(process.argv.slice(2))

  if (opts.history) {
    printHistory({
      count: opts.historyCount ?? 10,
      summary: !!opts.historySummary,
      model: opts.model || DEFAULT_MODEL,
      verbose: opts.verbose,
    })
    process.exit(0)
  }

  if (!opts.task) {
    console.error('gemini-delegate: --task "<description>" is required')
    process.exit(1)
  }
  const taskForLog = opts.task

  const inputContent = opts.inputFile ? fs.readFileSync(opts.inputFile, 'utf8') : ''
  let inputDesc = opts.inputFile ? `text:${inputContent.length}c` : 'task-only'

  // --file: an image/PDF/office doc for agy to read itself (multimodal), not text we read and
  // inline. Add its directory to --dirs and name it explicitly in the task so agy knows what to
  // open. Always bypasses the size gate below — there's no text length to gate on.
  if (opts.file) {
    const absFile = path.resolve(opts.file)
    if (!fs.existsSync(absFile)) {
      console.error(`gemini-delegate: --file not found: ${absFile}`)
      process.exit(1)
    }
    const dir = path.dirname(absFile)
    if (!opts.dirs.includes(dir)) opts.dirs.push(dir)
    opts.task = `${opts.task}\n\nThe file to look at is: ${absFile}`
    opts.force = true
    inputDesc = `file:${path.basename(absFile)}`
  }

  const { skipped, result } = delegateToGemini({
    task: opts.task,
    logTask: taskForLog,
    dirs: opts.dirs,
    model: opts.model || DEFAULT_MODEL,
    inputContent,
    inputDesc,
    force: opts.force,
    minChars: opts.minChars,
    verbose: opts.verbose,
  })

  if (skipped) {
    if (opts.verbose) {
      console.warn(`gemini-delegate: input (${inputContent.length} chars) is under the ${opts.minChars}-char threshold — not worth delegating. Handle it yourself.`)
    }
    process.exit(2)
  }

  if (!result) {
    console.error('gemini-delegate: delegation failed — handle this task yourself instead.')
    process.exit(1)
  }

  if (opts.verbose) {
    console.warn(`gemini-delegate: done in ${result.elapsedMs}ms (${result.usage?.total_tokens ?? '?'} tokens).`)
  }
  console.log(opts.raw ? result.response : JSON.stringify(result, null, 2))
}
