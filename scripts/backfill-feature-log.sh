#!/usr/bin/env bash
#
# Backfill the feature_log table from GitHub PR history.
# Requires: gh CLI authenticated, APP_URL or defaults to production.
#
# Usage:
#   ADMIN_SECRET=xxx ./scripts/backfill-feature-log.sh
#   ADMIN_SECRET=xxx APP_URL=http://localhost:3000 ./scripts/backfill-feature-log.sh

set -euo pipefail

APP_URL="${APP_URL:-https://cos-concept.vercel.app}"
ADMIN_SECRET="${ADMIN_SECRET:?Set ADMIN_SECRET env var}"
LIMIT="${LIMIT:-500}"

echo "Backfilling feature log from GitHub PRs..."
echo "App URL: $APP_URL"
echo "Limit: $LIMIT"
echo ""

COUNT=0
ERRORS=0

gh pr list \
  --repo tmtylblog/cosconcept \
  --state merged \
  --limit "$LIMIT" \
  --json number,title,body,mergedAt,author \
  --jq '.[] | @base64' | while read -r encoded; do

  # Decode
  PR=$(echo "$encoded" | base64 -d 2>/dev/null || echo "$encoded" | base64 --decode)

  TITLE=$(echo "$PR" | jq -r '.title')
  BODY=$(echo "$PR" | jq -r '.body // ""')
  PR_NUM=$(echo "$PR" | jq -r '.number')
  MERGED_AT=$(echo "$PR" | jq -r '.mergedAt')
  AUTHOR=$(echo "$PR" | jq -r '.author.login // "unknown"')

  # Extract category from conventional commit prefix
  CATEGORY="feature"
  case "$TITLE" in
    fix:*|fix\(*) CATEGORY="fix" ;;
    feat:*|feat\(*) CATEGORY="feature" ;;
    enhance:*|update:*|improve:*) CATEGORY="enhancement" ;;
    infra:*|ci:*|chore:*|perf:*|build:*) CATEGORY="infrastructure" ;;
    docs:*) CATEGORY="docs" ;;
    refactor:*) CATEGORY="enhancement" ;;
  esac

  # Strip conventional commit prefix from title
  CLEAN_TITLE=$(echo "$TITLE" | sed 's/^[a-z]*\([^)]*\)\?: //' | sed 's/^[a-z]*: //')

  # Extract summary from PR body (first 200 chars, single line)
  DESC=$(echo "$BODY" | head -5 | tr '\n' ' ' | cut -c1-200)

  # POST to API
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$APP_URL/api/admin/feature-log" \
    -H "Content-Type: application/json" \
    -H "x-admin-secret: $ADMIN_SECRET" \
    -d "$(jq -n \
      --arg title "$CLEAN_TITLE" \
      --arg description "$DESC" \
      --arg category "$CATEGORY" \
      --arg loggedBy "$AUTHOR" \
      --argjson prNumber "$PR_NUM" \
      --arg createdAt "$MERGED_AT" \
      '{title: $title, description: $description, category: $category, loggedBy: $loggedBy, prNumber: $prNumber, createdAt: $createdAt}'
    )")

  if [ "$HTTP_CODE" -eq 200 ]; then
    COUNT=$((COUNT + 1))
    echo "  ✓ PR #$PR_NUM: $CLEAN_TITLE ($CATEGORY)"
  else
    ERRORS=$((ERRORS + 1))
    echo "  ✗ PR #$PR_NUM: HTTP $HTTP_CODE"
  fi
done

echo ""
echo "Done. $COUNT entries created, $ERRORS errors."
