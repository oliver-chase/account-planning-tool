#!/usr/bin/env bash
# Size and remaining work for an audit target: a git repo, or a folder of skills.
# Usage: size.sh [--total [--staged]] [target-dir]   (default: current directory)
# --total prints only the total line count, one integer, with no backlog lookup. The size-ratchet
# gate and `olivercode size` read it, so the repo has one counter. --staged counts each tracked
# file as the index holds it, which is the tree a commit would record.
# Prints files, lines and bytes by kind (code, tests, docs, skills, config, other),
# the ratios the audit report cites, and open backlog items when the repo names a backlog-config.json.
set -euo pipefail

mode=report
staged=0
target=.
for arg in "$@"; do
  case "$arg" in
    --total) mode=total ;;
    --staged) staged=1 ;;
    *) target="$arg" ;;
  esac
done
cd "$target"

# The strict copies `olivercode bootstrap` stamps into a repo (the "strict" targets in OliverCode's
# shared/project-bootstrap-manifest.json). OliverCode owns them and conform fails any drift, so a repo's
# count leaves them out. This file is one of those copies and has no manifest to read, so it carries the
# list, and a test keeps it equal to the manifest. OliverCode keeps its originals at other paths, so they count.
MANAGED="QUALITY_BASELINE.md
scripts/check-structure-contract.mjs
.githooks/pre-commit
.githooks/commit-msg
scripts/size.sh
scripts/duplication_check.py"
export MANAGED

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  list() { git ls-files | grep -vxF "$MANAGED" || true; }
else
  list() { find . -type f -not -path '*/.git/*' -not -name '.DS_Store' -not -path '*/__pycache__/*' | sed 's|^\./||' | grep -vxF "$MANAGED" || true; }
fi

# The line count of one tracked file: the working copy, or the index copy under --staged.
count_lines() {
  if [ "$staged" = 1 ]; then git show ":$1" | wc -l | tr -d ' '; else wc -l <"$1" | tr -d ' '; fi
}

kind() {
  case "$1" in
    */tests/*|tests/*|*test_*.py|*_test.py|*.test.*|*.spec.*) echo tests ;;
    skills/*/scripts/*|*/skills/*/scripts/*) echo code ;;
    */SKILL.md|SKILL.md|*/skills/*|skills/*|references/*|*/references/*|*/agents/*|agents/*) echo skills ;;
    *.md|*.txt|*.rst|docs/*|*/docs/*) echo docs ;;
    *.py|*.sh|*.js|*.mjs|*.ts|*.tsx|*.jsx|*.html|*.css|*.swift|*.applescript|*.scpt|*.zsh|*.rb|*.go|scripts/*|*/scripts/*) echo code ;;
    *.json|*.yml|*.yaml|*.toml|*.csv|*.plist|*.example|.githooks/*|*.cfg|*.ini) echo config ;;
    *) echo other ;;
  esac
}

# --total in a git repo counts every tracked file's newlines in one pass, because the commit gate runs it
# on every commit and a per-file `git show` costs seconds on a large repo.
if [ "$mode" = total ] && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  STAGED="$staged" python3 - <<'PY'
import os, subprocess, sys
staged = os.environ["STAGED"] == "1"
managed = set(os.environ["MANAGED"].split("\n"))
entries = subprocess.run(["git", "ls-files", "-s", "-z"], capture_output=True, check=True).stdout.split(b"\0")
files = []
for entry in entries:
    if not entry:
        continue
    meta, _, path = entry.partition(b"\t")
    mode, sha, _stage = meta.split()
    path = os.fsdecode(path)
    if path in managed:
        continue
    # A symlink holds no lines of its own, and following it counted its target twice in the working tree.
    # Under --staged the index copy counts, even when the working file was deleted after staging.
    if (staged and mode != b"120000") or (os.path.isfile(path) and not os.path.islink(path)):
        files.append((mode, sha.decode(), path))
total = 0
if staged:
    blobs = [f for f in files if f[0] != b"160000"]
    proc = subprocess.run(["git", "cat-file", "--batch"], input="".join(f"{sha}\n" for _, sha, _ in blobs).encode(), capture_output=True, check=True)
    out, pos = proc.stdout, 0
    for _ in blobs:
        end = out.index(b"\n", pos)
        header = out[pos:end].split()
        size = int(header[2]) if len(header) == 3 and header[1] == b"blob" else 0
        total += out[end + 1:end + 1 + size].count(b"\n")
        pos = end + 1 + size + 1
else:
    for _, _, path in files:
        with open(path, "rb") as handle:
            total += handle.read().count(b"\n")
print(total)
PY
  exit 0
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
while IFS= read -r f; do
  [ -f "$f" ] && [ ! -L "$f" ] || continue
  lines=$(count_lines "$f")
  bytes=$(wc -c <"$f" | tr -d ' ')
  printf '%s\t%s\t%s\n' "$(kind "$f")" "$lines" "$bytes" >>"$tmp"
done < <(list)

if [ "$mode" = total ]; then
  awk -F'\t' '{ L += $2 } END { print L + 0 }' "$tmp"
  exit 0
fi

echo "== Size of $(basename "$(pwd)")"
awk -F'\t' '
  { n[$1]++; l[$1]+=$2; b[$1]+=$3; N++; L+=$2; B+=$3 }
  END {
    printf "%-8s %6s %9s %10s\n", "kind", "files", "lines", "KB"
    split("code tests docs skills config other", order, " ")
    for (i = 1; i <= 6; i++) { k = order[i]; if (n[k]) printf "%-8s %6d %9d %10.0f\n", k, n[k], l[k], b[k]/1024 }
    printf "%-8s %6d %9d %10.0f\n", "TOTAL", N, L, B/1024
    if (l["code"] > 0) printf "tests per 100 lines of code: %.0f\n", 100 * l["tests"] / l["code"]
    if (l["code"] + l["tests"] > 0) printf "docs+skills per 100 lines of code+tests: %.0f\n", 100 * (l["docs"] + l["skills"]) / (l["code"] + l["tests"])
  }' "$tmp"

rc=0
# The repo's own config wins over a test fixture that happens to sort first.
cfg="$(git ls-files 2>/dev/null | grep -x 'docs/backlog-config.json' || git ls-files 2>/dev/null | grep -v fixture | grep -m1 'backlog-config.json' || true)"
if [ -n "$cfg" ] && command -v gh >/dev/null 2>&1; then
  # The path goes in as an argument, so a quote in it cannot break the Python source.
  repo="$(python3 -c "import json,sys; c=json.load(open(sys.argv[1])); print(c['repoOwner']+'/'+c['repoName'])" "$cfg")"
  echo
  echo "== Remaining work ($repo)"
  gh issue list --repo "$repo" --state open --limit 500 --json number,labels \
    --jq '"open issues: \(length)"' 2>/dev/null || { echo "open issues: unavailable (gh failed)"; rc=1; }
  proj="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['projectNumber'])" "$cfg")"
  owner="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['projectOwner'])" "$cfg")"
  gh project item-list "$proj" --owner "$owner" --limit 500 --format json \
    --jq '.items | group_by(.status) | map("\(.[0].status // "No status"): \(length)") | .[]' 2>/dev/null \
    || { echo "board status counts: unavailable"; rc=1; }
else
  echo
  echo "== Remaining work: no backlog-config.json in this repo; read docs/BACKLOG.md or the handoff file"
fi
if [ "$rc" -ne 0 ]; then
  exit 1
fi
