#!/usr/bin/env bash
# check-ownership.sh — Warns when an agent edits files outside its assigned area.
#
# Set AGENT_AREA env var when starting each agent:
#   AGENT_AREA=agent-a claude --worktree agent-a/feat/task
#
# Exit codes:
#   0 = allow (always — this hook warns, never blocks)
#
# The warning prints to stderr so the agent sees it in tool output.

set -euo pipefail

# Read tool input from stdin
INPUT=$(cat)

# Extract file_path from the JSON payload
FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//')

# If no file path found, allow silently
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# If no AGENT_AREA set, allow silently (human dev or unconfigured agent)
if [ -z "${AGENT_AREA:-}" ]; then
  exit 0
fi

# ── Area ownership map ──────────────────────────────────────────────
# Update this when agent assignments change. Paths are prefix-matched.
# Format: area|path_prefix (one per line)

OWNERSHIP_MAP="
agent-a|src/app/api/team-import/
agent-a|src/app/api/experts/
agent-a|src/components/experts/
agent-a|src/lib/enrichment/expert
agent-a|src/lib/enrichment/specialist
agent-b|src/app/(app)/discover/
agent-b|src/lib/matching/
agent-b|src/lib/ai/ossy-tools.ts
agent-b|src/lib/ai/ossy-prompt.ts
agent-b|src/components/chat/
agent-b|src/components/discover/
agent-c|src/app/(app)/firm/
agent-c|src/app/api/firm/
agent-d|src/app/(app)/settings/
agent-d|src/app/(app)/partnerships/
agent-d|src/app/(app)/network/
agent-d|src/lib/billing/
agent-d|src/app/api/stripe/
agent-d|src/app/api/billing/
agent-e|scripts/
agent-e|data/
"

# ── Shared files (any agent can edit) ───────────────────────────────
SHARED_PATTERNS="
CLAUDE.md
STATUS.md
package.json
package-lock.json
.gitignore
.claude/
docs/
drizzle.config.ts
next.config.ts
tsconfig.json
src/lib/utils.ts
src/lib/env.ts
src/app/globals.css
"

# Check if file matches a shared pattern (always allowed)
for pattern in $SHARED_PATTERNS; do
  pattern=$(echo "$pattern" | tr -d '[:space:]')
  [ -z "$pattern" ] && continue
  if echo "$FILE_PATH" | grep -q "^${pattern}\|/${pattern}"; then
    exit 0
  fi
done

# ── Schema serialization warning ────────────────────────────────────
if echo "$FILE_PATH" | grep -q "src/lib/db/schema.ts\|drizzle/"; then
  echo "WARNING: Schema file detected ($FILE_PATH). Only ONE agent should modify schema at a time. Coordinate via STATUS.md." >&2
  exit 0
fi

# Check if file belongs to another agent's area
FILE_OWNER=""
for line in $OWNERSHIP_MAP; do
  line=$(echo "$line" | tr -d '[:space:]')
  [ -z "$line" ] && continue

  OWNER=$(echo "$line" | cut -d'|' -f1)
  PREFIX=$(echo "$line" | cut -d'|' -f2)

  if echo "$FILE_PATH" | grep -q "^${PREFIX}\|/${PREFIX}"; then
    FILE_OWNER="$OWNER"
    break
  fi
done

# If file has no owner, it's unassigned — allow silently
if [ -z "$FILE_OWNER" ]; then
  exit 0
fi

# If this agent owns the file, allow silently
if [ "$FILE_OWNER" = "$AGENT_AREA" ]; then
  exit 0
fi

# File belongs to another agent — warn but allow
echo "WARNING: You ($AGENT_AREA) are editing a file owned by $FILE_OWNER: $FILE_PATH" >&2
echo "Coordinate via STATUS.md before continuing. Update STATUS.md if you are taking ownership." >&2

exit 0
