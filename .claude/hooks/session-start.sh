#!/usr/bin/env bash
# .claude/hooks/session-start.sh
# SessionStart: inject branch, PLAN.md open items, and CONTEXT.md (if present) into session context.

PROJECT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
BRANCH=$(git -C "$PROJECT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
LAST_COMMIT=$(git -C "$PROJECT" log -1 --oneline 2>/dev/null || echo "no commits")
DIRTY=$(git -C "$PROJECT" status --porcelain 2>/dev/null | wc -l | tr -d ' ')

CONTEXT=""
if [ -f "$PROJECT/CONTEXT.md" ]; then
  CONTEXT=$(cat "$PROJECT/CONTEXT.md")
fi

OPEN_ITEMS=""
if [ -f "$PROJECT/PLAN.md" ]; then
  OPEN_ITEMS=$(grep -n '^[[:space:]]*- \[ \]' "$PROJECT/PLAN.md" | head -8)
fi

ADDITIONAL="Branch: $BRANCH | Last commit: $LAST_COMMIT | Uncommitted files: $DIRTY"
[ -n "$CONTEXT" ] && ADDITIONAL="$ADDITIONAL

$CONTEXT"

if [ -n "$OPEN_ITEMS" ]; then
  ADDITIONAL="$ADDITIONAL

## Open PLAN.md items (first 8)
$OPEN_ITEMS"
else
  ADDITIONAL="$ADDITIONAL

PLAN.md has no open checklist items ([ ]) — the tracked plan is fully checked off."
fi

jq -n \
  --arg ctx "$ADDITIONAL" \
  --arg title "day-planner [$BRANCH]" \
  '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $ctx, sessionTitle: $title}}'
