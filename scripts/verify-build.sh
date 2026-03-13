#!/usr/bin/env bash
# verify-build.sh — Run lint + build in sequence before pushing.
# Usage: bash scripts/verify-build.sh  (or: npm run verify)
set -euo pipefail

echo "==========================================="
echo "  COS Concept — Pre-Push Verification"
echo "==========================================="
echo ""

echo "=== Step 1/2: Linting ==="
npm run lint
echo "✓ Lint passed"
echo ""

echo "=== Step 2/2: Building ==="
npm run build
echo "✓ Build passed"
echo ""

echo "==========================================="
echo "  ALL CHECKS PASSED — safe to push"
echo "==========================================="
