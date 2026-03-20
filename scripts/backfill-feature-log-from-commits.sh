#!/usr/bin/env bash
#
# Backfill feature_log from git commits (no jq dependency).

set -euo pipefail

APP_URL="${APP_URL:-https://cos-concept.vercel.app}"
ADMIN_SECRET="${ADMIN_SECRET:?Set ADMIN_SECRET env var}"

echo "Backfilling feature log from git commits..."
echo "App URL: $APP_URL"
echo ""

COUNT=0
SKIPPED=0
ERRORS=0

git log --format="%H|%an|%aI|%s" --reverse | while IFS='|' read -r HASH AUTHOR DATE TITLE; do
  # Skip merge commits
  case "$TITLE" in
    Merge\ branch*|Merge\ pull\ request*|Merge\ remote*) SKIPPED=$((SKIPPED + 1)); continue ;;
  esac

  # Skip trivial
  [ ${#TITLE} -lt 5 ] && { SKIPPED=$((SKIPPED + 1)); continue; }

  # Category from prefix
  CATEGORY="feature"
  case "$TITLE" in
    fix:*|fix\(*) CATEGORY="fix" ;;
    feat:*|feat\(*) CATEGORY="feature" ;;
    enhance:*|update:*|improve:*) CATEGORY="enhancement" ;;
    infra:*|ci:*|chore:*|perf:*|build:*) CATEGORY="infrastructure" ;;
    docs:*) CATEGORY="docs" ;;
    refactor:*) CATEGORY="enhancement" ;;
    debug:*) CATEGORY="fix" ;;
    style:*|lint:*|test:*) CATEGORY="infrastructure" ;;
  esac

  # Strip prefix
  CLEAN_TITLE=$(echo "$TITLE" | sed 's/^[a-z]*([^)]*)!*: //' | sed 's/^[a-z]*!*: //')
  CLEAN_TITLE="${CLEAN_TITLE:0:200}"

  # Escape for JSON (handle quotes and backslashes)
  ESCAPED_TITLE=$(echo "$CLEAN_TITLE" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g')
  ESCAPED_AUTHOR=$(echo "$AUTHOR" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g')

  PAYLOAD="{\"title\":\"$ESCAPED_TITLE\",\"category\":\"$CATEGORY\",\"loggedBy\":\"$ESCAPED_AUTHOR\",\"commitHash\":\"$HASH\",\"createdAt\":\"$DATE\"}"

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$APP_URL/api/admin/feature-log" \
    -H "Content-Type: application/json" \
    -H "x-admin-secret: $ADMIN_SECRET" \
    -d "$PAYLOAD" 2>/dev/null || echo "000")

  if [ "$HTTP_CODE" = "200" ]; then
    COUNT=$((COUNT + 1))
    [ $((COUNT % 50)) -eq 0 ] && echo "  ... $COUNT entries created"
  else
    ERRORS=$((ERRORS + 1))
    [ $ERRORS -le 5 ] && echo "  ✗ HTTP $HTTP_CODE: $CLEAN_TITLE"
    [ $ERRORS -eq 6 ] && echo "  ... suppressing further errors"
  fi
done

echo ""
echo "Done. Created: $COUNT, Skipped: $SKIPPED, Errors: $ERRORS"
