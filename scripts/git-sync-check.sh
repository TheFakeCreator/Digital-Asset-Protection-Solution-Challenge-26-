#!/bin/bash
# scripts/git-sync-check.sh
# Shows whether your current branch is ahead/behind origin/main.

set -euo pipefail

TARGET="origin/main"
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo "Fetching latest from origin..."
git fetch origin

echo ""
echo "Latest commits on ${TARGET}:"
git log --oneline --decorate --max-count=8 "${TARGET}"

echo ""
COUNTS=$(git rev-list --left-right --count "HEAD...${TARGET}")
AHEAD=$(echo "${COUNTS}" | awk '{print $1}')
BEHIND=$(echo "${COUNTS}" | awk '{print $2}')

echo "Current branch: ${CURRENT_BRANCH}"
echo "Ahead by: ${AHEAD} commit(s)"
echo "Behind by: ${BEHIND} commit(s)"

if [ "${BEHIND}" -gt 0 ]; then
  echo ""
  echo "Your branch is behind ${TARGET}. Rebase before pushing:"
  echo "  git rebase ${TARGET}"
fi
