#!/usr/bin/env python3
"""The docs check. Managed file: `olivercode bootstrap` keeps it level with OliverCode's copy.

Compares what the code says exists with what the README and docs say, and fails on a real miss. A check whose
source does not exist in the repo is skipped, so one file serves OliverCode and every fleet repo.

    python3 scripts/docs_check.py [ROOT]

- usage: every command in the launcher's COMMANDS table (scripts/lib/cli.py) is named in README.md or docs/SETUP.md
- gates: the "Commit gates" table in docs/GATES.md lists exactly the gates in core/hooks/gates/
- gate runners: each script docs/GATES.md names as a gate, written "gate (`path`)", exists and a shell script under scripts/
  or a hook in .githooks/ or core/hooks/ runs it, so a gate dropped from validation fails here
- skills: the table in skills/INDEX.md lists exactly the skills in skills/
- readme: every document in docs/ is linked from README.md, and every docs/ link in README.md exists

Standard library only. Exits 1 with one line per miss and the fix.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

# A gate file that has no "Commit gates" row of its own: the commit-message gate has its own section, and a repo's local gate is a hook point.
GATE_FILES_WITHOUT_ROW = {"commit-msg", "repo-local"}


def read(root: Path, rel: str) -> str:
    path = root / rel
    return path.read_text(encoding="utf-8", errors="ignore") if path.is_file() else ""


def check_usage(root: Path) -> list[str]:
    cli = read(root, "scripts/lib/cli.py")
    if not cli:
        return []
    names = list(dict.fromkeys(re.findall(r'^\s*\("olivercode ([a-z][a-z-]*)', cli, re.M)))
    docs = read(root, "README.md") + "\n" + read(root, "docs/SETUP.md")
    return [f"usage: `olivercode {n}` is in the command table and neither README.md nor docs/SETUP.md names it; add it to the Commands section of README.md"
            for n in names if not re.search(rf"olivercode {re.escape(n)}\b|`{re.escape(n)}[` ]", docs)]


def gate_titles(root: Path) -> dict[str, str]:
    build = read(root, "scripts/build-hooks.py")
    block = re.search(r"TITLES\s*=\s*\{(.*?)\}", build, re.S)
    return dict(re.findall(r'"([a-z-]+)":\s*"([^"]+)"', block.group(1))) if block else {}


def check_gates(root: Path) -> list[str]:
    gates_dir = root / "core" / "hooks" / "gates"
    doc = read(root, "docs/GATES.md")
    if not gates_dir.is_dir() or not doc:
        return []
    titles = gate_titles(root)
    table = re.search(r"^## Commit gates\n(.*?)(?=^## |\Z)", doc, re.S | re.M)
    first = re.search(r"^\| Gate .*?(?:\n\n|\Z)", table.group(1) if table else "", re.S | re.M)  # the first table only
    rows = {m.group(1).strip() for m in re.finditer(r"^\| ([^|]+?) \|", first.group(0) if first else "", re.M)} - {"Gate"}
    rows = {r for r in rows if not set(r) <= {"-", " "}}
    problems = []
    expected = {}
    for gate in sorted(p.stem for p in gates_dir.glob("*.sh")):
        if gate in GATE_FILES_WITHOUT_ROW:
            continue
        expected[titles.get(gate, gate)] = gate
        if titles.get(gate, gate) not in rows:
            problems.append(f"gates: core/hooks/gates/{gate}.sh has no row named \"{titles.get(gate, gate)}\" in the Commit gates table of docs/GATES.md; add the row")
    for row in sorted(rows - set(expected)):
        problems.append(f"gates: docs/GATES.md lists the gate \"{row}\" and core/hooks/gates/ holds no such gate; remove the row or restore the gate")
    return problems


GATE_SCRIPT = re.compile(r"gate \(`([^`]+\.(?:py|sh))`\)")


def _runs(path: Path, name: str) -> bool:
    text = path.read_text(encoding="utf-8", errors="ignore")
    return any(name in line and not line.lstrip().startswith("#") for line in text.splitlines())


def check_gate_runners(root: Path) -> list[str]:
    doc = read(root, "docs/GATES.md")
    problems = []
    for rel in dict.fromkeys(GATE_SCRIPT.findall(doc)):
        if not (root / rel).is_file():
            problems.append(f"gate runners: docs/GATES.md lists the gate {rel} and the file does not exist; restore it or remove it from docs/GATES.md")
            continue
        runners = [p for p in [*(root / "scripts").rglob("*.sh"), *(root / ".githooks").glob("*"), *(root / "core" / "hooks").rglob("*")]
                   if p.is_file() and p != root / rel]
        if not any(_runs(p, Path(rel).name) for p in runners):
            problems.append(f"gate runners: docs/GATES.md lists the gate {rel} and no script or hook runs it; run it from scripts/validate.sh")
    return problems


def check_skills(root: Path) -> list[str]:
    index = read(root, "skills/INDEX.md")
    if not index:
        return []
    listed = set(re.findall(r"^\| `([a-z0-9-]+)` \|", index, re.M))
    present = {p.parent.name for p in (root / "skills").glob("*/SKILL.md")}
    return ([f"skills: skills/{n}/SKILL.md exists and skills/INDEX.md has no row for `{n}`; add the row" for n in sorted(present - listed)]
            + [f"skills: skills/INDEX.md lists `{n}` and skills/{n}/SKILL.md does not exist; remove the row" for n in sorted(listed - present)])


def check_readme(root: Path) -> list[str]:
    readme = read(root, "README.md")
    docs = root / "docs"
    if not readme or not docs.is_dir():
        return []
    linked = set(re.findall(r"\]\((?:\./)?(docs/[^)#\s]+)", readme))
    problems = [f"readme: README.md links {p} and the file does not exist; fix the link" for p in sorted(linked) if not (root / p).exists()]
    for md in sorted(docs.glob("*.md")):
        if f"docs/{md.name}" not in linked:
            problems.append(f"readme: docs/{md.name} is not linked from README.md; add a row to its Documentation table")
    return problems


def run(root: Path) -> list[str]:
    return check_usage(root) + check_gates(root) + check_gate_runners(root) + check_skills(root) + check_readme(root)


def main(argv: list[str]) -> int:
    root = Path(argv[0]).resolve() if argv else Path(__file__).resolve().parent.parent
    problems = run(root)
    for line in problems:
        print(line)
    if problems:
        print(f"docs check FAILED: {len(problems)} miss(es).")
        return 1
    print("docs check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
