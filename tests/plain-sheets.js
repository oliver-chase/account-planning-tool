'use strict'
// A workbook has one plainly named sheet per type, and opens again with everything intact.
// Run: node tests/plain-sheets.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert')
const root = path.join(__dirname, '..')
const XLSX = require(path.join(root, 'js/xlsx.full.min.js'))
const store = {}
const sandbox = { assert, console, XLSX, process, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v) } },
  document: { getElementById: () => null }, window: { addEventListener() {} }, setTimeout, clearTimeout,
  renderAll() {}, showToast() {}, showModal: async () => ({ buttonValue: 'confirm' }), persistFileHandle() {}, forgetPersistedFileHandle() {}, resetOverviewCadenceUI() {} }
const src = ['js/state.js', 'js/excel.js', 'js/start.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n') + `
const names = wb => wb.SheetNames.join()

// A brand-new account with a name, one person and one action: plain names, six or fewer.
startNewAccount('Acme', 'Ada', 'CEO')
state.actions.push({ id: 'a1', description: 'Send deck', owner: 'Ada', engagement: '', status: 'Open', due_date: '2026-11-20', closed_date: '', created_date: today(), last_updated: today() })
let wb = buildWorkbook()
assert.strictEqual(names(wb), 'Overview,People,Actions', names(wb))

// It opens again with everything intact.
importWorkbook(wb, 'acme.xlsx')
assert.strictEqual(state.account.account_name, 'Acme')
assert.strictEqual(state.stakeholders.length, 1)
assert.strictEqual(state.actions[0].due_date, '2026-11-20')

// A type with content gets its sheet; an empty type does not.
state.notes.push({ id: 'n1', date: today(), type: 'Meeting', title: 'Kickoff', attendees: [], body: 'x', transcript_link: '', created_date: today(), last_updated: today() })
assert.strictEqual(names(buildWorkbook()), 'Overview,People,Actions,Notes')

// Two rows with one ID get separate IDs, so editing one cannot overwrite the other.
const dup = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(dup, XLSX.utils.aoa_to_sheet([['Field', 'Value'], ['Account Name', 'Dup']]), 'Overview')
XLSX.utils.book_append_sheet(dup, XLSX.utils.aoa_to_sheet([['ID', 'Name'], ['p-1', 'Dana'], ['p-1', 'Sam']]), 'People')
importWorkbook(dup, 'dup.xlsx')
assert.strictEqual(new Set(state.stakeholders.map(p => p.id)).size, 2)

// Statuses typed any way read as the three the screens know, and a name with a comma stays whole.
const typed = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(typed, XLSX.utils.aoa_to_sheet([['Field', 'Value'], ['Account Name', 'Typed']]), 'Overview')
XLSX.utils.book_append_sheet(typed, XLSX.utils.aoa_to_sheet([['ID', 'Description', 'Status'], ['a1', 'x', 'open'], ['a2', 'y', 'In-Progress'], ['a3', 'z', 'Complete'], ['a4', 'w', 'later']]), 'Actions')
XLSX.utils.book_append_sheet(typed, XLSX.utils.aoa_to_sheet([['ID', 'Date', 'Title', 'Attendees'], ['n1', '2026-11-01', 'Call', 'Smith, John; Ann']]), 'Notes')
importWorkbook(typed, 'typed.xlsx')
assert.strictEqual(state.actions.map(a => a.status).join(), 'Open,In Progress,Done,Open')
assert.strictEqual(state.actions[2].closed_date, '', 'a Done row with no closed date keeps none, so an old action is not counted as finished this week')
assert.strictEqual(JSON.stringify(state.notes[0].attendees), '["Smith, John","Ann"]')

console.log('plain-sheets: ok')
`
vm.runInNewContext(src, sandbox)
