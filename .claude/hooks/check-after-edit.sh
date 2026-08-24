#!/usr/bin/env bash
# .claude/hooks/check-after-edit.sh
# PostToolUse: run `node --check` on the edited .js file and surface syntax errors.
# day-planner has no linter configured — this is a cheap syntax-only safety net.

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

if [ -z "$FILE" ] || [[ "$FILE" != *.js ]] || [[ "$FILE" == *node_modules* ]]; then
  exit 0
fi

CHECK_OUTPUT=$(node --check "$FILE" 2>&1)
CHECK_EXIT=$?

if [ $CHECK_EXIT -ne 0 ]; then
  jq -n \
    --arg ctx "node --check failed (post-edit) — $FILE:
$CHECK_OUTPUT" \
    '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}'
fi

exit 0
