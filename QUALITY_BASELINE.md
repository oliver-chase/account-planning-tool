# Quality baseline

This repo runs OliverCode's shared quality files and hooks, and OliverCode is their one source. Change one there, never here, because `olivercode sync-hooks` replaces a local edit.

- What every repo must match: OliverCode's `docs/CONTRACT.md`
- The gates and what each blocks: OliverCode's `docs/GATES.md`
- Check this repo from OliverCode: `scripts/olivercode conform <this repo's path>`
- Deploy the current files and hooks from OliverCode: `scripts/olivercode sync-hooks`
