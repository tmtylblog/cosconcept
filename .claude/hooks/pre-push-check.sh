#!/usr/bin/env bash
# pre-push-check.sh — Warns before git push if the agent hasn't pulled latest.
#
# Runs on all Bash tool calls. Only activates when the command contains "git push".
# Exit codes:
#   0 = allow (always — this hook warns, never blocks)

set -euo pipefail

# Read tool input from stdin
INPUT=$(cat)

# Extract the command from JSON payload
COMMAND=$(echo "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"command"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//')

# Only activate for git push commands
if ! echo "$COMMAND" | grep -q "git push"; then
  exit 0
fi

# Block force pushes with a warning
if echo "$COMMAND" | grep -q "\-\-force\|-f "; then
  echo "BLOCKED: Force push detected. This is not allowed in multi-agent development." >&2
  echo "Use 'git push' (without --force) after rebasing on latest main." >&2
  exit 2
fi

# Check if we're behind origin/main
BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "unknown")

if [ "$BEHIND" != "0" ] && [ "$BEHIND" != "unknown" ]; then
  echo "WARNING: You are $BEHIND commit(s) behind origin/main." >&2
  echo "Run 'git fetch origin && git pull --rebase origin main' before pushing." >&2
  echo "Then run 'npx next build' to verify nothing is broken." >&2
  exit 0
fi

# Check package-lock.json drift
if git diff --cached --name-only 2>/dev/null | grep -q "^package.json$"; then
  if ! git diff --cached --name-only 2>/dev/null | grep -q "^package-lock.json$"; then
    echo "WARNING: package.json is staged but package-lock.json is NOT." >&2
    echo "Run 'npm install' and stage package-lock.json too." >&2
  fi
fi

# Remind about build check and context files
echo "REMINDER: Run 'npm run verify' (lint + build) before pushing." >&2
echo "REMINDER: Did you update docs/context/ files? (See CLAUDE.md → Context Knowledge System)" >&2

exit 0
