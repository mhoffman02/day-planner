# Dual-CLI Blended Multi-Model Workflow

This repository uses a **3-tier blended multi-model architecture** split across two complementary CLI harnesses sharing the same git working copy:

1. **Claude Code CLI (`claude`)** — Powered by your **Claude Pro subscription** (Claude 3.7 Sonnet / Opus).
2. **Antigravity CLI (`agy`)** — Powered by **Gemini 3.8 Flash (Medium)** as interactive driver, with **Gemini Flash-Lite** and **Gemini Pro** subagents.
3. **Local Deterministic Scripts** — Zero-token, zero-RAM CPU checks (ESLint, ESM import checker, pre-commit hook).

---

## 1. Model Tier Responsibilities

| Tier | Model Family & Harness | Primary Responsibilities |
| :--- | :--- | :--- |
| **Tier 1: Lead Architect & Strategic Reviewer** | **Claude 3.7 Sonnet / Opus** (via `claude` CLI)<br>*In-harness fallback: Gemini Pro (`invoke_subagent(Model="pro")` in `agy`)* | • Architectural design, ADRs, and schema boundary design.<br>• OAuth token lifecycle and Google Workspace REST API scopes (`drive.file`).<br>• Complex algorithmic Spikes (e.g. `syncEngine.js` 2-way reconciliation).<br>• Adversarial pre-commit security & code reviews. |
| **Tier 2: Interactive Driver & Orchestrator** | **Gemini 3.8 Flash (Medium)** (via `agy` CLI) | • Active tactical feature coding and refactoring.<br>• Rapid edit-test-debug loops (`npm test`).<br>• CDP browser smoke testing (`tools/ensure-chrome.js`, `tools/e2e/smoke-test.js`).<br>• Massive whole-repo context ingestion. |
| **Tier 3: Local & Lightweight Workers** | **Gemini Flash-Lite** (`invoke_subagent(Model="flash_lite")` in `agy`)<br>+ **Deterministic Local Scripts** (`tools/`) | • Session context compaction (`/compact-kilo`).<br>• Structured changelogs & retrospective append (`/retro`).<br>• Mechanical ESM `.js` import checks (`node tools/check-esm-imports.js`).<br>• JSDoc `@file` headers, ESLint, and service worker cache hash checks. |

---

## 2. When to Switch Between Harnesses

### A. When in `agy` (Antigravity CLI) ➔ Prompt the User to Switch to `claude`:
When a task involves:
1. **Architectural Pivots**: Designing new subsystems or changing cross-module storage contracts.
2. **Google OAuth / Security Re-scoping**: Modifying `src/googleAuth.js` or Google Workspace API scopes.
3. **Deep Adversarial Code Review**: Final review pass of non-trivial code changes before merging.

**Action**:
Post the directive to the bridge and present the prompt to the user:
```bash
node tools/agent-bridge.js send --from agy --to claude --type review "Describe the task or review request here"
```
Then instruct the user:
> 🔄 **SWITCH TO CLAUDE-CODE CLI**
> Run `claude` in your terminal and resume with:
> `node tools/agent-bridge.js read --for claude`

---

### B. When in `claude` (Claude Code CLI) ➔ Prompt the User to Switch to `agy`:
When a task involves:
1. **Executing Implementation Plans**: Writing feature code and iterating on unit tests.
2. **CDP Live Browser Testing**: Launching Chrome DevTools Protocol smoke tests (`tools/e2e/smoke-test.js`).
3. **Rapid Tool & Command Loops**: Fast iterative command-line cycles without burning Claude rate limits.

**Action**:
Post the directive to the bridge and present the prompt to the user:
```bash
node tools/agent-bridge.js send --from claude --to agy --type task "Describe the implementation or test task here"
```
Then instruct the user:
> 🔄 **SWITCH TO ANTIGRAVITY CLI**
> Run `agy` in your terminal and resume with:
> `node tools/agent-bridge.js read --for agy`

---

## 3. Inter-Harness Communication Protocol

Both harnesses must follow these practices:

1. **Session Start**:
   Check if the counterpart left any pending messages or review requests:
   ```bash
   node tools/agent-bridge.js read
   ```
   Acknowledge read messages with `node tools/agent-bridge.js ack`.

2. **Session Handoff**:
   Always run `/handoff` (or `node tools/handoff.js`) before switching tools. This updates `PLAN.md`, writes `CONTEXT.md`, and creates a clean commit so the counterpart never encounters uncommitted drift.

3. **Shared Agent Configuration**:
   All rules, commands, and skills live under `.agents/`. Any modifications must be synced with `node tools/sync-agent-config.js` so both `claude` and `agy` stay in lockstep.
