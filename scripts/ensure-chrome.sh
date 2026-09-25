#!/usr/bin/env bash
# Thin shim — delegates to tools/ensure-chrome.js (the canonical implementation).
# Usage: bash scripts/ensure-chrome.sh [targetUrl]
exec node "$(dirname "$0")/../tools/ensure-chrome.js" "$@"
