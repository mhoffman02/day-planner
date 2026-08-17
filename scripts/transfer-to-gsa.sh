#!/usr/bin/env bash
# scripts/transfer-to-gsa.sh
# Dual-remote setup helper for GSA Enterprise GitHub

set -e

if [ -z "$1" ]; then
  echo "Usage: ./scripts/transfer-to-gsa.sh <GSA_REPO_URL>"
  echo "Example: ./scripts/transfer-to-gsa.sh git@github.com:GSA/day-planner.git"
  exit 1
fi

GSA_URL="$1"

echo "=== Configuring GSA Enterprise GitHub Remote ==="
if git remote | grep -q "^gsa$"; then
  echo "Remote 'gsa' already exists. Updating URL to: $GSA_URL"
  git remote set-url gsa "$GSA_URL"
else
  echo "Adding remote 'gsa' with URL: $GSA_URL"
  git remote add gsa "$GSA_URL"
fi

echo "Verifying remotes:"
git remote -v

echo ""
echo "Pushing master branch to GSA Enterprise repository..."
git push -u gsa master
git push gsa --tags

echo "🎉 Success! Repository pushed to GSA Enterprise GitHub ($GSA_URL)."
echo "Next step: Enable Private GitHub Pages under Repo Settings -> Pages."
