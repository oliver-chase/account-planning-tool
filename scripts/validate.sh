#!/usr/bin/env bash
# validate.sh: this repo's one validation command. Run `bash scripts/validate.sh` before every commit.
# It runs the commit gates over every tracked file, the structure contract, then every Node test.
# tests/dom.js builds account-planning-tool.html from the current source first.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# managed:validate-queue block, kept in step by sync-hooks and bootstrap
# One machine-wide queue for validation runs, taken through the validate-queue helper this machine installs.
# Without the helper the run goes ahead unqueued.
VALIDATE_QUEUE_BIN="$HOME/.local/bin/validate-queue"
if [[ -z "${VALIDATE_QUEUE_SLOT:-}" ]]; then
  if [[ -x "$VALIDATE_QUEUE_BIN" ]]; then
    VALIDATE_QUEUE_SLOT="$("$VALIDATE_QUEUE_BIN" acquire --pid $$ --label "$(basename "${REPO_ROOT:-$PWD}")" || true)"
    export VALIDATE_QUEUE_SLOT="${VALIDATE_QUEUE_SLOT:-none}"
    # A script's own EXIT trap wins: the queue reaps a slot whose process has exited, so nothing leaks.
    [[ -n "$(trap -p EXIT)" ]] || trap '"$VALIDATE_QUEUE_BIN" release "$VALIDATE_QUEUE_SLOT" >/dev/null 2>&1 || true' EXIT
  else
    echo "validate: no validate-queue helper at $VALIDATE_QUEUE_BIN, running unqueued" >&2
  fi
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
