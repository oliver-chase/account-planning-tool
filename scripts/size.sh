#!/usr/bin/env bash
# Size and remaining work for an audit target: a git repo, or a folder of skills.
# Usage: size.sh [--total] [--staged] [target-dir]   (default: current directory)
# --total prints only the total line count, one integer, with no backlog lookup, and equals the report's
# TOTAL row. --staged counts each tracked file as the index holds it; without it the working tree counts.
# A nested git repo inside a plain folder that sits in a repo is left out, like a submodule.
# A top-level data/ folder is left out, since account data a sync writes is not the repo's own size.
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
cd -- "$target"
if [ "$staged" = 1 ] && ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "size.sh: --staged needs a git repo, and $target is not one." >&2
  exit 2
fi

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

# The tracked files, NUL-separated so a name with a newline or non-ASCII letters stays one file, minus the managed copies.
list() {
  STAGED="$staged" python3 -c '
import os, subprocess, sys
managed = set(os.environ["MANAGED"].split("\n"))
staged = os.environ["STAGED"] == "1"
prefix = ""
names = []
skip = set()
in_repo = subprocess.run(["git", "rev-parse", "--is-inside-work-tree"], capture_output=True).returncode == 0
if in_repo:
    prefix = subprocess.run(["git", "rev-parse", "--show-prefix"], capture_output=True, text=True).stdout.strip()
    for entry in subprocess.run(["git", "ls-files", "-s", "-z"], capture_output=True, check=True).stdout.decode("utf-8", "surrogateescape").split("\0"):
        meta, _, path = entry.partition("\t")
        names.append(path)
        # Under --staged a symlink (120000) and a submodule gitlink (160000) hold no lines, as in the worktree report.
        if staged and meta.split()[:1] in (["120000"], ["160000"]):
            skip.add(path)
# A folder that holds no tracked files (a plain folder, even one inside a parent repo) is listed instead:
# inside a git work tree by git, so .gitignore applies, and outside any repo by walking the folder. Only a repo root keeps the managed list, and --staged counts nothing.
if not any(names):
    if not in_repo or prefix:
        managed = set()
    prefix = ""
    skip = set()
    if staged:
        names = []
    elif in_repo:
        names = [n for n in subprocess.run(["git", "ls-files", "--others", "--exclude-standard", "-z"], capture_output=True, check=True).stdout.decode("utf-8", "surrogateescape").split("\0") if not n.endswith(".DS_Store")]
    else:
        names = [os.path.relpath(os.path.join(d, f)) for d, ds, fs in os.walk(".") if ".git" not in d.split(os.sep) and "__pycache__" not in d.split(os.sep) for f in fs if f not in (".DS_Store", ".git")]
# An unmerged file lists once per index stage, and counts once.
for n in dict.fromkeys(names):
    # The top-level data/ folder holds what syncs write, so it is left out of the count.
    if n and n not in skip and prefix + n not in managed and not (prefix + n).startswith("data/"):
        sys.stdout.buffer.write(n.encode("utf-8", "surrogateescape") + b"\0")
'
}

# One file as the index holds it (stage 0), or as the working tree holds it when a merge left it unmerged.
staged_blob() { git show ":0:./$1" 2>/dev/null || cat -- "$1" 2>/dev/null || true; }

# The line count of one tracked file: the working copy, or the index copy under --staged.
# A binary file (a NUL in its first 8000 bytes, git's own test) holds no lines, as in the --total count below.
count_lines() {
  if [ "$staged" = 1 ]; then
    # The blob is read once into a scratch file (a shell variable would drop its NULs and trailing newlines).
    staged_blob "$1" >"$tmp.blob"
    [ "$(head -c 8000 "$tmp.blob" | tr -d '\000' | wc -c)" -lt "$(head -c 8000 "$tmp.blob" | wc -c)" ] && { echo 0; return; }
    wc -l <"$tmp.blob" | tr -d ' '
  else
    [ "$(head -c 8000 <"$1" | tr -d '\000' | wc -c)" -lt "$(head -c 8000 <"$1" | wc -c)" ] && { echo 0; return; }
    wc -l <"$1" | tr -d ' '
  fi
}

kind() {
  case "$1" in
    */SKILL.md|SKILL.md|references/*.md|*/references/*.md|agents/*.md|*/agents/*.md) echo skills ;;
    *.md|*.txt|*.rst) echo docs ;;
    */tests/*|tests/*|test_*.py|*/test_*.py|*_test.py|*.test.*|*.spec.*|*/fixtures/*.body) echo tests ;;
    *.json|*.yml|*.yaml|*.toml|*.csv|*.plist|*.example|*.cfg|*.ini|.gitignore|.gitattributes|*/CODEOWNERS) echo config ;;
    skills/*/scripts/*|*/skills/*/scripts/*) echo code ;;
    *.py|*.sh|*.js|*.mjs|*.ts|*.tsx|*.jsx|.githooks/*) echo code ;;
    references/*|*/references/*|*/agents/*|agents/*|*/skills/*|skills/*) echo skills ;;
    docs/*|*/docs/*) echo docs ;;
    *.html|*.css|*.swift|*.applescript|*.scpt|*.zsh|*.rb|*.go|scripts/*|*/scripts/*) echo code ;;
    *) echo other ;;
  esac
}

# --total in a git repo counts every tracked file's newlines in one pass, since a per-file `git show` is slow.
if [ "$mode" = total ] && git rev-parse --is-inside-work-tree >/dev/null 2>&1 && [ -n "$(git ls-files | head -c 1)" ]; then
  STAGED="$staged" python3 - <<'PY'
import os, subprocess, sys
staged = os.environ["STAGED"] == "1"
managed = set(os.environ["MANAGED"].split("\n"))
prefix = subprocess.run(["git", "rev-parse", "--show-prefix"], capture_output=True, text=True).stdout.strip()
entries = subprocess.run(["git", "ls-files", "-s", "-z"], capture_output=True, check=True).stdout.split(b"\0")
files = []
unmerged = {}
merged = set()
for entry in entries:
    if not entry:
        continue
    meta, _, path = entry.partition(b"\t")
    mode, sha, stage = meta.split()
    path = os.fsdecode(path)
    if prefix + path in managed or (prefix + path).startswith("data/"):
        continue
    if stage != b"0":
        # An unmerged path has no stage-0 entry and counts once, from its working copy.
        unmerged[path] = True
        continue
    merged.add(path)
    # A symlink holds no lines of its own, so the target is counted once.
    # Under --staged the index copy counts, even when the working file was deleted after staging.
    if (staged and mode != b"120000") or (os.path.isfile(path) and not os.path.islink(path)):
        files.append((mode, sha.decode(), path))
total = 0
for path in unmerged:
    if path not in merged and os.path.isfile(path) and not os.path.islink(path):
        with open(path, "rb") as handle:
            data = handle.read()
        if b"\0" not in data[:8000]:
            total += data.count(b"\n")
if staged:
    blobs = [f for f in files if f[0] != b"160000"]
    proc = subprocess.run(["git", "cat-file", "--batch"], input="".join(f"{sha}\n" for _, sha, _ in blobs).encode(), capture_output=True, check=True)
    out, pos = proc.stdout, 0
    for _ in blobs:
        end = out.index(b"\n", pos)
        header = out[pos:end].split()
        size = int(header[2]) if len(header) == 3 and header[1] == b"blob" else 0
        data = out[end + 1:end + 1 + size]
        # A binary file (a NUL in its first 8000 bytes, git's own test) holds no lines.
        if b"\0" not in data[:8000]:
            total += data.count(b"\n")
        pos = end + 1 + size + 1
else:
    for _, _, path in files:
        with open(path, "rb") as handle:
            data = handle.read()
        if b"\0" not in data[:8000]:
            total += data.count(b"\n")
print(total)
PY
  exit 0
fi

# Files are classified by their path from the repo root, whichever folder the report runs from.
KPREFIX="$(git rev-parse --show-prefix 2>/dev/null || true)"
tmp="$(mktemp)"
trap 'rm -f "$tmp" "$tmp.blob"' EXIT
while IFS= read -r -d '' f; do
  if [ "$staged" = 1 ]; then
    git show ":0:./$f" >/dev/null 2>&1 || [ -f "$f" ] || continue   # an unmerged file deleted from disk has no copy to count
    bytes=$(staged_blob "$f" | wc -c | tr -d ' ')   # the index copy counts, even when the working file was deleted after staging
  else
    [ -f "$f" ] && [ ! -L "$f" ] || continue
    bytes=$(wc -c <"$f" | tr -d ' ')
  fi
  lines=$(count_lines "$f")
  printf '%s\t%s\t%s\n' "$(kind "$KPREFIX$f")" "$lines" "$bytes" >>"$tmp"
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
root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
cfg="$(git ls-files 2>/dev/null | grep -x 'docs/backlog-config.json' || git ls-files 2>/dev/null | grep -v fixture | grep -m1 'backlog-config.json' || true)"
[ -n "$cfg" ] || { [ -n "$root" ] && [ -f "$root/docs/backlog-config.json" ] && cfg="$root/docs/backlog-config.json"; } || true
if [ -n "$cfg" ] && command -v gh >/dev/null 2>&1; then
  # The path goes in as an argument, so a quote in it cannot break the Python source. A config that cannot be read
  # ends the lookup with a named reason, and the report above it still prints.
  cfg_get() { python3 -c "
import json, sys
c = json.load(open(sys.argv[1]))
v = [c[k] for k in sys.argv[2:]]
if not all(isinstance(x, (str, int)) and x != '' for x in v):
    sys.exit(1)
print(*v, sep='/')" "$cfg" "$@" 2>/dev/null; }
  repo="$(cfg_get repoOwner repoName || true)"
  echo
  if [ -z "$repo" ]; then
    echo "== Remaining work: $cfg cannot be read as a backlog config (needs repoOwner and repoName)"
    exit 1
  fi
  echo "== Remaining work ($repo)"
  gh issue list --repo "$repo" --state open --limit 1000 --json number \
    --jq 'if length >= 1000 then "open issues: 1000 or more" else "open issues: \(length)" end' 2>/dev/null || { echo "open issues: unavailable (gh failed)"; rc=1; }
  board="$(cfg_get projectOwner projectNumber || true)"
  if [ -z "$board" ]; then
    echo "board status counts: unavailable (the config names no projectOwner and projectNumber)"
    rc=1
  else
    gh project item-list "${board#*/}" --owner "${board%%/*}" --limit 1000 --format json \
      --jq '.items | if length == 0 then "board items: 0" else ((if length >= 1000 then "board items: 1000 or more" else empty end), (group_by(.status) | map("\(.[0].status // "No status"): \(length)") | .[])) end' 2>/dev/null \
      || { echo "board status counts: unavailable"; rc=1; }
  fi
elif [ -n "$cfg" ]; then
  echo
  echo "== Remaining work: gh is not installed, so the lookup for $cfg is skipped"
else
  echo
  echo "== Remaining work: no backlog-config.json in this repo; read docs/BACKLOG.md or the handoff file"
fi
if [ "$rc" -ne 0 ]; then
  exit 1
fi
