#!/usr/bin/env bash
# scripts/transfer-to-gsa.sh
# Dual-remote setup helper for GSA Enterprise GitHub

set -e

GSA_URL="${1:-https://github.com/oO-Mike-Oo/day-planner.git}"

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
