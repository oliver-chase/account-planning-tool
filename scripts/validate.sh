#!/bin/bash
# Builds account-planning-tool.html from the current source, then runs every Node test against it.
set -e
cd "$(dirname "$0")/.."
# The tests read the built page, so it is rebuilt from the source first.
python3 scripts/build-single-file.py >/dev/null
for t in tests/*.js; do
  out=$(node "$t") || { echo "validate: $t failed. Run: node $t"; exit 1; }
  case "$out" in *skipping*) echo "validate: note: $out" ;; esac
done
echo "validate: ok"
