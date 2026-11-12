#!/bin/bash
# Loads the built page in WebKit (the engine Safari uses) at six widths and walks the sections. It
# fails on sideways scrolling, a page that is not the window width, anything poking out of its
# card, touch targets under 44 px below 720 px, or an error in the export, summary and workbook
# steps. macOS only. Needs the Xcode command-line tools, not full Xcode.
# Run: bash tests/webkit/run.sh
set -e
here="$(cd "$(dirname "$0")" && pwd)"
page="$here/../../account-planning-tool.html"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
swiftc -swift-version 5 -o "$tmp/harness" "$here/harness.swift" -framework AppKit -framework WebKit
fail=0
for size in 390:844 540:900 700:900 800:900 1000:800 1280:800; do
  w="${size%%:*}"; h="${size##*:}"
  out="$(timeout 100 "$tmp/harness" "$page" "$here/steps" "$w" "$h" || true)"
  [ -n "$out" ] || { echo "the harness did not finish at ${w}x${h}"; fail=1; continue; }
  layout="$(echo "$out" | grep -A1 "03-layout" | tail -1)"
  echo "== ${w}x${h}: $layout" | cut -c1-200
  echo "$out" | grep -q "FAILED" && { echo "a step failed"; fail=1; }
  echo "$out" | grep -q '"[A-Za-z]*Err[A-Za-z]*":' && { echo "an export or workbook step raised an error"; echo "$out" | grep -A1 "04-features"; fail=1; }
  echo "$layout" | grep -q "\"scrollWidth\":$w," || { echo "page is not $w wide"; fail=1; }
  feat="$(echo "$out" | grep -A1 "04-features" | tail -1)"
  echo "$feat" | grep -q '"parseMoney":1200000' || { echo "money parsing is wrong in WebKit"; fail=1; }
  echo "$feat" | grep -q '"exportMenu":2' || { echo "the Export menu does not list its two entries"; fail=1; }
  echo "$feat" | grep -q '"callSummaryLines":[1-9]' || { echo "the call summary is empty"; fail=1; }
  echo "$feat" | grep -q '"roundTrip":true' || { echo "the workbook does not write and read back every sheet"; fail=1; }
  echo "$feat" | grep -q '"updateExcelRan":true' || { echo "Update Excel did not run"; fail=1; }
  sample="$(echo "$out" | grep -A1 "02-sample" | tail -1)"
  echo "$sample" | grep -q '"people":[1-9]' || { echo "the sample account loaded no people"; fail=1; }
  echo "$sample" | grep -q '"actions":[1-9]' || { echo "the sample account loaded no actions"; fail=1; }
  for sec in overview people actions notes; do echo "$layout" | grep -q "\"$sec\":\"ok\"" || { echo "the $sec section overflows the window"; fail=1; }; done
  echo "$layout" | grep -q '"pokesOutOfCard":\[\]' || { echo "something pokes out of its card"; fail=1; }
  cols=1; [ "$w" -gt 1024 ] && cols=2
  echo "$layout" | grep -q "\"planColumns\":$cols" || { echo "the Plan rows should be $cols column(s) at $w px"; fail=1; }
  if [ "$w" -le 720 ]; then echo "$layout" | grep -q '"small":\[\]' || { echo "touch targets under 44 px"; fail=1; }; fi
done
[ "$fail" = 0 ] && echo "webkit: ok"
exit $fail
