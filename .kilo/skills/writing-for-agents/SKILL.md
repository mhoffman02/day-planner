---
name: writing-for-agents
description: Writing documents for agents. Use when creating or editing skills, or modifying AGENTS.md or CLAUDE.md.
tags: [meta, skills, documentation, prompting]
version: 1.0.0
source: adapted from mattpocock/skills (2026-09-25 ADOPT decision, .kilocode/TODO.md / DECISIONS.md)
---

# Writing For Agents

- Read [SKILL-MECHANICS.md](SKILL-MECHANICS.md) before authoring any new `SKILL.md` in `.kilo/skills/`.

## Context pointers

- Sharpen pointer wording before considering inlining content.
- State the target material and list distinct triggering branches.
- Front-load the leading trigger word in the description or pointer.
- Use one trigger per distinct branch; collapse synonyms.
- Omit descriptions of details already defined in the file body.

## Load management

- Minimize always-loaded text in `AGENTS.md`, `CLAUDE.md`, and skill descriptions.
- Reserve human cognitive load for decisions requiring human judgment.
- Push reference material behind pointers to avoid unconditional context load.

## Information hierarchy

- Organize content into three tiers:
  1. In-file steps: ordered actions.
  2. In-file reference: on-demand reference material.
  3. Disclosed reference: separate files accessed via pointers only when triggered.
- Apply progressive disclosure: inline shared basics; push branch-specific details behind pointers.
- Co-locate definitions, rules, and caveats under a single heading.
- Split documents by branch or sequence when sprawl occurs.

## Steps and completion criteria

- Define explicit completion criteria for every step.
- State thoroughness demands directly (e.g., "account for every modified file").
- Isolate downstream steps across context boundaries (e.g. subagent dispatch) only when criteria are irreducibly fuzzy and premature completion occurs.

## Splitting rules

- Split sequences when later steps cause agents to rush earlier steps.
- Follow [SKILL-MECHANICS.md](SKILL-MECHANICS.md) for invocation-based splits.

## Leading words and phrasing

- Use established industry terminology (`seam`, `tracer bullet`, `frontier`) over newly coined terms.
- Prompt target positive behaviors instead of prohibitions.
- Restrict negations and bans to strict, non-negotiable guardrails.

## Pruning rules

- Maintain a single source of truth for each rule or definition.
- Do not duplicate environmental state (`package.json`, `.env.example`) unless caching unwritten conventions.
- Remove stale, sedimented layers.
- Eliminate no-op instructions that models follow by default.

## Skill wrappers

- Create individual model-invoked skills only when distinct trigger phrases exist.
- Consolidate tools under a single user-invoked router skill when relying on explicit user invocation.
