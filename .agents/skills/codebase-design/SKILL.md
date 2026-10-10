---
name: codebase-design
description: Shared vocabulary for designing deep modules. Use when the user wants to design or improve a module's interface, find deepening opportunities, decide where a seam goes, make code more testable or AI-navigable, or when another skill needs the deep-module vocabulary.
tags: [design, architecture, interfaces, vocabulary]
version: 1.0.0
source: adapted from mattpocock/skills (2026-09-25 ADOPT decision, .kilocode/TODO.md / DECISIONS.md)
---

# Codebase Design

## Terminology Rules

Use specified terms strictly; do not substitute alternative terminology:
- **Module**: Entity with an interface and an implementation. Never use "unit", "component", or "service".
- **Interface**: Full operational contract required to use the module (types, invariants, ordering, errors, configuration, performance). Never use "API" or "signature".
- **Implementation**: Internal body of code.
- **Depth**: Leverage at the interface; extensive behavior behind a small interface.
- **Seam**: Exact location where a module's interface lives and behavior can be altered without editing internal code. Never use "boundary".
- **Adapter**: Concrete implementation satisfying an interface at a seam.
- **Leverage**: Caller capability gained per unit of interface complexity.
- **Locality**: Concentration of changes, defects, and verification in a single location.

## Interface Design Directives

- Always build deep modules (minimal interface surface area covering substantial internal implementation).
- Never build shallow modules (broad interfaces acting as thin passthroughs).
- Minimize method count and simplify parameter signatures on all interfaces.
- Treat the interface as the sole test surface; test through external seams and never test past the interface.
- Never introduce a seam unless at least two distinct adapters vary across it.
- Apply the deletion test: eliminate modules whose removal does not distribute complexity across callers.

## Designing for Testability

- Accept dependencies as arguments; never instantiate or read dependencies internally.
- Return results from functions; never produce side effects or execute unrequested I/O in transformation logic.
- Minimize interface surface area to reduce required test setup and permutations.

## Generator Pure Function Standards

- Export pure functions with small interfaces and zero inline I/O in `tools/generate-*.js` (`isExcludedFeature`, `selectFeatureEntries`, `abstractFieldValue`, `buildStepItems`).
- Export all new generator logic as pure functions accepting inputs and returning results; never inline business logic in `main()`.

## Reference Documents

- Consult [DEEPENING.md](DEEPENING.md) for dependency categorization, seam discipline, and replace-don't-layer testing.
- Consult [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md) to generate and compare competing interface designs via parallel subagents.
