#!/bin/bash
# Runs every Node test and checks that account-planning-tool.html is built from the current source.
set -e
cd "$(dirname "$0")/.."
# The tests read the built page, so it must match the source first.
python3 scripts/build-single-file.py --check || { echo "validate: the built page is stale. Run: python3 scripts/build-single-file.py"; exit 1; }
for t in tests/*.js; do
  out=$(node "$t") || { echo "validate: $t failed. Run: node $t"; exit 1; }
  case "$out" in *skipping*) echo "validate: note: $out" ;; esac
done
echo "validate: ok"
