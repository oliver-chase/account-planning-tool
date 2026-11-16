#!/usr/bin/env bash
# validate.sh: this repo's one validation command. Run `bash scripts/validate.sh` before every commit.
# It runs the commit gates over every tracked file, the structure contract, then every Node test.
# tests/dom.js builds account-planning-tool.html from the current source first.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# bash runs the hook whether or not its executable bit survived a copy, so the gates never skip silently.
echo "=== validate: pre-commit gates ==="
OLIVERCODE_SCAN_TREE=1 bash .githooks/pre-commit

echo "=== validate: structure contract ==="
node scripts/check-structure-contract.mjs

echo "=== validate: tests ==="
for t in tests/*.js; do
  out=$(node "$t") || { echo "validate: $t failed. Run: node $t"; exit 1; }
  case "$out" in *skipping*) echo "validate: note: $out" ;; esac
done
echo "=== validate: passed ==="
