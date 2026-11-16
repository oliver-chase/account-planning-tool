#!/bin/bash
# Runs every Node test. tests/dom.js builds account-planning-tool.html from the current source first.
set -e
cd "$(dirname "$0")/.."
for t in tests/*.js; do
  out=$(node "$t") || { echo "validate: $t failed. Run: node $t"; exit 1; }
  case "$out" in *skipping*) echo "validate: note: $out" ;; esac
done
echo "validate: ok"
