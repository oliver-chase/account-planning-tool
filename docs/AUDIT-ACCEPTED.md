# Accepted audit rows

Audit findings that were reviewed and not changed, each with its reason.

| Finding | Reason |
|---|---|
| `export.js` and `filterbar.js` merged into `app-shell.js` | Each has one job and one test or caller. Merging moves code without removing any. |
| One grey token for the SVG icons | The search, sort and popover icons are data URIs that cannot read a custom property, and the greys differ slightly by design. |
| Undo for deleting notes and people | The owner decided that notes and people are removed only after a confirmation that starts on Cancel, with no Undo. Notes and people carry linked data that an Undo would have to restore. |
| Moving a card with the keyboard has a visible hint and a picked outline, no Move button | The hint line and outline cover the path; a button per card adds visual noise. |
| Reviewing `ORG_EXPORT_CSS` against `accounts.css` | A standalone page needs its own CSS, and the export test checks the output exists and is static. |
| Note cards carry the group role, with no button role or `aria-expanded` | A card holds editable fields, so a button role would nest interactive controls inside a button. The group's accessible name says collapsed or expanded instead. |
| Shared test sandbox stub across test files | Each test needs a different set of stubs, so one shared helper would need options for most of them. |
| No CI test workflow | The owner decided against one: the PR workflows stay off. The pre-commit hook and `scripts/validate.sh` run the same checks, and the one workflow only publishes the built page. |
| `docs/CATALOG.md` lists generated rows only, and its header names the audit generator | The catalog covers scripts and config files, and a tool outside this repo generates it. The test and fixture scripts and the release workflow (the catalog skips dot folders) are described in the README table, which also says how each part starts, because the catalog's Start column reads only a part's own first comment line. |
| Update Excel keeps no extra columns | The owner decided that Update Excel warns in Chrome and Edge and names what the file loses, and does not merge columns it does not know. |
| A Done row with no ClosedDate is left out of the call summary's finished list | A row with no date cannot be placed in a week, and stamping one on import would count old work as finished this week. |
| A name typed as a note attendee stays on that note and does not join the team list | Attendees vary by call, and the team list is the planned account team that the owner pickers offer. Adding every guest would fill those pickers with one-time names. |
| `package-lock.json` is not committed | jsdom is a test-only dependency pinned to major version 26, and `tests/dom.js` fails with a clear message when it is missing. A lock file would add about 18 KB of churn for one test. |
| Identical declarations under different selectors in `accounts.css` (hover, focus and margin helpers) | Each rule sits at its own point in the cascade, and merging selectors moves them, so a computed-style comparison would be needed for a few lines saved. |
| Pixel sizes written outside the tokens | They are one-off layout measurements, such as a chart gutter or an icon box, that no other rule shares. A token for each adds names without a second use. |
| The README layout table names the audit ledger and accepted-findings files | The files ship in the repository, and the layout table names every file a reader will find. |

Accepted: owner-identity index.html - the tool's own title matches the repository name, so the owner-identity check flags it
Accepted: owner-identity docs/IDENTIFIER-GATE.json - the gate file lists the tool's own title so the check can find it, the same reason as index.html
