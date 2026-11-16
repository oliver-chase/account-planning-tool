# Agent rules

Global rules in `~/.claude/CLAUDE.md` apply. Repo specifics:

- The source is `index.html`, `js/` and `css/`, and `scripts/build-single-file.py` builds the one file people open, `account-planning-tool.html`, which git ignores. `DESIGN_SYSTEM.md` lists the components and tokens every section uses
- `bash scripts/validate.sh` is the one validation command: OliverCode's commit gates over every tracked file, the structure contract and every Node test. Run `npm install` once first. The fleet pre-commit hook runs it through `.githooks/pre-commit.local`, and `olivercode sync-hooks` keeps the hooks current
- The live backlog is the GitHub Project that the local, git-ignored `docs/backlog-config.json` names. File and groom it with the `backlog` skill
- The repository is public and its history carries no personal address, so new commits use the neutral noreply author set in the local git config
- `docs/repo-structure-contract.md` records how this repo follows OliverCode
