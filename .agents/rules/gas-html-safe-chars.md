# GAS HtmlService Truncation on Literal `//`, Backticks, and Apostrophes

Google Apps Script's `HtmlService.createHtmlOutputFromFile().getContent()` (used by `include('Script')` and `include('Styles')`) has an AST/lexer bug that silently truncates served HTML/JS files:
- It truncates from the first literal `//` found inside ANY string literal or template literal to the end of that source line.
- It truncates at any literal apostrophe (`'`), backtick (`` ` ``), or `//` found inside comment prose (`//` or `/* */`).

When this occurs, lines are served half-cut (e.g., `const url = prompt('URL (https:`), causing unclosed tokens and immediate browser crashes:
`Uncaught SyntaxError: Failed to execute 'write' on 'Document': Invalid or unexpected token`.

## Rules to Enforce

1. **Protocol URLs in String Literals**:
   - NEVER write `'https://...'` or `"https://..."` or `` `https://${...}` `` in `gas-app/*.html` files.
   - ALWAYS split the double slash: `'https:' + '/' + '/...'`.
2. **Comment Prose**:
   - NEVER use ASCII apostrophes (`'`) or backticks (`` ` ``) in comment prose in `gas-app/*.html` files.
   - Use typographic curly apostrophes (`’`) or rephrase without apostrophes.
3. **Automated Enforcement**:
   - Run `npm run check:gas-safe-chars` before any commit or `clasp push`.
   - Wired into `npm run lint` and the `.githooks/pre-commit` hook.
