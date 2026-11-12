# Account planning tool

One HTML file for running a recurring account call. It shows who is who, what is owed by when and what was said last time, and it keeps an Excel workbook current. There is no login, no server and nothing to install.

## Get it and open it

Download `account-planning-tool.html` from the repository: open the file on GitHub and choose Download raw file, or clone the repository. It is one self-contained file with nothing to install, so it can be moved, renamed or emailed. Open it in Chrome or Edge. A new account offers three ways in: start a new account, open an Excel file, or try a sample account. Everything you type saves in the browser as you go.

## How a call goes

The How-to guide in the sidebar walks through a call: open the file, check who is on it, capture actions and notes, send the call summary and click Update Excel.

## The four sections

- **Plan:** the account's objective, strategy, revenue target, risks and review dates, plus meeting cadence and revenue
- **People:** cards and an org chart, where dragging a card onto another sets who reports to whom
- **Actions:** what is owed, with owners, due dates and Overdue and Due this week filters
- **Notes:** one note per call

The Plans and Revenue sheets hold the Plan page's fields and revenue chart. Update Excel replaces the file with the sheets and columns this tool writes, and names anything else in the file before it replaces it.

## Your workbook

Excel is the record. The start screen downloads a blank or sample workbook so you can see the layout: Overview, Plans, People, Actions and Notes sheets with plain names.

## Browsers

Chrome and Edge give the full experience: Update Excel writes into your workbook and the tool reconnects to it next time. Safari and Firefox work too, but Update Excel downloads a new file each time. The autosave lives in the browser, so a different browser or cleared site data starts without it until you save to Excel.

## Working on the source

You need Node and Python 3, and the WebKit run also needs macOS with the Xcode command-line tools. Run `npm install` once, then `scripts/validate.sh` to run every test and the build check. `python3 scripts/build-single-file.py` rebuilds `account-planning-tool.html`, which is tracked so the repo holds the file people open. `bash tests/webkit/run.sh` loads the built page in WebKit, the engine Safari uses, at six widths from 390 to 1280 px on a Mac. `DESIGN_SYSTEM.md` lists the components and tokens. Run `git config core.hooksPath .githooks` once per clone so each commit runs the validation first.

## Where things are

| Path | What it holds |
|---|---|
| `index.html`, `js/`, `css/` | The source: the page, the scripts and the styles |
| `account-planning-tool.html` | The built single file people open |
| `scripts/build-single-file.py` | Builds the single file from the source, and checks it is current with `--check` |
| `tests/` | The Node tests, the simulated-browser test (`dom.js`) and the WebKit run (`webkit/`) |
| `tests/fixtures/` | A workbook that stores dates the way Excel does, and the script that writes it |
| `tests/banned-words.local.txt` | Your own list of names that must never ship, one per line, kept out of git. Without the file the test reads a comma-separated `BANNED_WORDS` variable, and with neither it skips that check |
| `scripts/validate.sh` | Runs every Node test and the build check. The pre-commit hook calls it |
| `.githooks/pre-commit` | Runs `scripts/validate.sh` before each commit once `core.hooksPath` is set |
| `docs/CATALOG.md` | One row per script and config file, generated from the files themselves |
| `docs/AUDIT-ACCEPTED.md` | Audit findings that were reviewed and not changed, with the reason for each |
| `docs/SHARING.md` | Whether the tool is shared, and what blocks a public copy |
| `docs/backlog-config.example.json` | Template for the local, git-ignored `docs/backlog-config.json` that the owner's backlog tooling reads. The tool never reads either |
| `package.json` | Lists jsdom, which only `tests/dom.js` uses |
| `js/xlsx.full.min.js` | SheetJS Community Edition 0.20.3, which reads and writes the workbook, bundled under the Apache 2.0 license (sheetjs.com) |
| `LICENSE` | MIT license for this tool's own code |
| `DESIGN_SYSTEM.md` | The components and tokens every section is built from |

## Security

To report a security problem, open an issue titled Security with no details, and the maintainer will reply with a private way to send them.
