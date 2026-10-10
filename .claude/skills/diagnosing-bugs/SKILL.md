---
name: diagnosing-bugs
description: Diagnosis loop for hard bugs and performance regressions. Use when the user says "diagnose"/"debug this", or reports something broken/throwing/failing/slow.
tags: [debugging, diagnosis, root-cause, testing]
version: 1.0.0
source: adapted from mattpocock/skills (2026-09-25 ADOPT decision, .kilocode/TODO.md / DECISIONS.md)
---

# Diagnosing Bugs

- Follow all phases sequentially; do not skip phases without explicit justification.
- Read `.kilocode/DECISIONS.md` for the target module before forming hypotheses.
- If unable to construct a feedback loop after 2 attempts, stop and escalate to `advisor` per `.kilo/rules/advisor-escalation.md`.

## Secret Redaction

- Redact all secrets and credentials in commands, outputs, and artifacts; replace values with `<REDACTED>`.
- Bind tests and execution loops to environment variables; never hardcode credentials.

## Phase 1: Build Feedback Loop

Construct an automated pass/fail signal before inspecting code or theorizing:

1. **Failing `node:test`**: Add a failing test at the target seam in `tools/__tests__/*.test.js`.
2. **CLI fixture invocation**: Run CLI against fixture input and diff stdout/output against a known-good snapshot (e.g. `node tools/generate-job-aids.js --app=work-orders` against `content/job-aids/work-orders/*.md`).
3. **Corpus scan script**: Run a deterministic scanner over `data/source-snapshot/features/*.json` or `content/**/*.md` (e.g. `node tools/scan-manual-step-leaks.js`).
4. **Trace replay**: Replay a saved `data/source-snapshot/features/<id>.json` fixture through the generator function in isolation.
5. **Differential loop**: Run feature JSON through the generator before and after changes; diff Markdown output.
6. **Bisection**: Run `git bisect run` using the failing test or scan script.

### Tighten Loop

- Reduce execution scope (run one `--app=X` instead of `--all`; target a specific test file).
- Narrow assertions to specific failure tokens.
- Enforce strict determinism; eliminate all flaky diffs.

### Phase 1 Completion Gate

Do not proceed to Phase 2 until one command has been executed at least once and satisfies all criteria:
- [ ] **Red-capable**: exercises target bug path and asserts exact symptom.
- [ ] **Deterministic**: identical result on every run.
- [ ] **Fast**: completes in seconds, not minutes.
- [ ] **Agent-runnable**: executes with zero human intervention.

## Phase 2: Reproduce and Minimise

1. Run the loop to confirm reproduction of the user's exact symptom.
2. Confirm consistent reproduction across multiple consecutive runs.
3. Minimise input to smallest reproducible unit (one file, one scenario, or one field).
4. Remove elements one at a time, re-running loop after each removal until every remaining element is load-bearing.

## Phase 3: Hypothesise

1. Formulate 3–5 ranked, falsifiable hypotheses ("If <X> is the cause, then <changing Y> will make the bug disappear") before testing.
2. Present ranked hypotheses to the user before testing; proceed without blocking if user is unavailable.

## Phase 4: Instrument

1. Change one variable at a time.
2. Add targeted `console.error` calls at boundaries distinguishing hypotheses; do not log broadly.
3. Prefix every debug log statement with a unique tag (e.g. `[DEBUG-a4f2]`).

## Phase 5: Fix and Regression Test

1. Verify an established seam exists per `codebase-design`. If no seam exists, record the missing seam in `.kilocode/DECISIONS.md`.
2. Convert minimised reproduction into a failing `node:test` case.
3. Run `npm test` and verify failure.
4. Apply the minimal fix.
5. Run `npm test` and verify pass.
6. Re-run Phase 1 feedback loop against the un-minimised scenario (e.g. full `--all` corpus generation and scan).

## Phase 6: Cleanup

Complete all items before declaring resolution:
- [ ] Verify original repro no longer triggers bug.
- [ ] Confirm regression test passes (or document absence of seam in `.kilocode/DECISIONS.md`).
- [ ] Remove all `[DEBUG-...]` log statements using grep.
- [ ] Run `npm run lint` and verify clean.
- [ ] Run `npm test` and verify green.
- [ ] Document verified hypothesis in `.kilocode/DECISIONS.md` and commit message.
