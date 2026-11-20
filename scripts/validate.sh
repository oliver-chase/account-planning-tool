#!/usr/bin/env bash
# validate.sh: this repo's one validation command. Run `bash scripts/validate.sh` before every commit.
# It runs the commit gates over every tracked file, the structure contract, then every Node test.
# tests/dom.js builds account-planning-tool.html from the current source first.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# olivercode:validate-queue managed block, kept in step by sync-hooks and bootstrap
# One machine-wide queue for validation runs, held in OliverCode's scripts/lib/validate_queue.py.
# Without an OliverCode checkout the run goes ahead unqueued.
OC_QUEUE="$(dirname "$(readlink ~/.claude/CLAUDE.md 2>/dev/null)" 2>/dev/null)/scripts/lib/validate_queue.py"
if [[ -z "${OLIVERCODE_VALIDATE_SLOT:-}" && -f "$OC_QUEUE" ]]; then
  OLIVERCODE_VALIDATE_SLOT="$(python3 "$OC_QUEUE" acquire --pid $$ --label "$(basename "${REPO_ROOT:-$PWD}")" || true)"
  export OLIVERCODE_VALIDATE_SLOT="${OLIVERCODE_VALIDATE_SLOT:-none}"
  # A script's own EXIT trap wins: the queue reaps a slot whose process has exited, so nothing leaks.
  [[ -n "$(trap -p EXIT)" ]] || trap 'python3 "$OC_QUEUE" release "$OLIVERCODE_VALIDATE_SLOT" >/dev/null 2>&1 || true' EXIT
fi

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
