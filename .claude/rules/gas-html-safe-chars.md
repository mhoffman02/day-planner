---
paths: ["gas-app/**"]
---

# GAS HtmlService Truncation: `//`, Apostrophes, Backticks

`HtmlService...getContent()` (via `include('Script')`/`include('Styles')`) silently truncates served files: from a literal `//` inside any string/template literal to end of line, and at any apostrophe, backtick or `//` in comment prose. Result: half-cut lines, then `Uncaught SyntaxError: Failed to execute 'write' on 'Document': Invalid or unexpected token`.

In `gas-app/*.html`:
1. Never write `'https://...'`, `"https://..."` or `` `https://${...}` ``; split: `'https:' + '/' + '/...'`.
2. No ASCII `'` or backtick in comment prose; use curly `’` or rephrase.

Enforced: `npm run check:gas-safe-chars` (in `npm run lint` and pre-commit).
