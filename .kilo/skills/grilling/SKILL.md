---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or says "grill me" or any other grill phrase.
tags: [interview, planning, requirements]
version: 1.0.0
source: adapted from mattpocock/skills (2026-09-25 ADOPT decision, .kilocode/TODO.md / DECISIONS.md)
---

# Grilling

- Interview the user relentlessly until reaching a shared understanding.
- Map all decisions as a **design tree**: branch every decision into downstream decisions hanging off it.
- Work the tree in **rounds**.
- Define the **frontier** as every decision whose prerequisites are settled (questions askable immediately without guessing unprovided answers).
- Ask the entire frontier in one round: number each question and provide a recommended answer.
- Wait for user answers before starting the next round.
- Recompute the frontier after each user response; advance the frontier outward as settled decisions unblock dependent questions.
- Never ask a question whose prerequisite depends on another open question in the current round; defer it to a later round.

Format a round like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

- Find facts yourself; never ask the user for information discoverable from the environment (filesystem, tools, corpus stats).
- Dispatch a subagent (`explore` for read-only investigation, per `~/.kilo/rules/delegation.md`) when a frontier question requires environmental facts.
- Do not block the round on running exploration: treat running exploration as an unsettled prerequisite, defer downstream questions, and ask the rest of the frontier immediately.
- Leave decisions to the user: put each decision to the user and wait.
- Conclude the session only when the frontier is empty: visit every branch of the design tree and leave zero silent assumptions.
- Do not act until the user explicitly confirms a shared understanding.
