'use strict'
// The start screen: a new account, the sample account and the blank workbook it downloads.
// Run: node tests/start.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert')
const root = path.join(__dirname, '..')
const XLSX = require(path.join(root, 'js/xlsx.full.min.js'))
const store = {}
const sandbox = { assert, console, XLSX, process, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v) } },
  document: { getElementById: () => null }, window: { addEventListener() {} }, setTimeout, clearTimeout,
  renderAll() {}, showToast() {}, showModal: async () => ({ buttonValue: 'confirm' }), persistFileHandle() {}, forgetPersistedFileHandle() {}, resetOverviewCadenceUI() {} }
const src = ['js/state.js', 'js/excel.js', 'js/start.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n') + `
const rowsOf = (wb, name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' })
// A fresh account is blank, and a named one is not.
assert.strictEqual(isBlankAccount(state), true)

// Start a new account: needs a name; the first person is optional.
assert.strictEqual(startNewAccount('  ', 'Ada', 'CEO'), false)
assert.strictEqual(isBlankAccount(state), true)
assert.strictEqual(startNewAccount('Acme', 'Ada', 'CEO'), true)
assert.strictEqual(state.account.account_name, 'Acme')
assert.strictEqual(JSON.stringify(state.stakeholders.map(p => [p.name, p.title])), '[["Ada","CEO"]]')
assert.strictEqual(isBlankAccount(state), false)

// The sample opens as a populated account with a chart, overdue and upcoming actions, and a note.
markSynced() // nothing unsaved, so the sample loads without asking
state = emptyState()
loadSampleAccount()
assert.strictEqual(state.account.account_name, 'Northwind Example')
const byName = n => state.stakeholders.find(p => p.name === n)
assert.ok(state.stakeholders.length >= 5)
assert.strictEqual(byName('Jo Park').reports_to, byName('Marco Lee').id)
assert.strictEqual(byName('Tess Wu').reports_to, '', 'one person is left unplaced')
assert.ok(state.actions.length >= 3)
assert.ok(state.actions.every(a => /^\\d{4}-\\d{2}-\\d{2}$/.test(a.due_date)), 'every sample action has a due date')
assert.ok(state.actions.some(a => a.due_date < today()) && state.actions.some(a => a.due_date > today()))
assert.ok(state.notes.length >= 1)
assert.strictEqual(state.plans[0].objective, 'Move from one pilot site to all four regions')
assert.strictEqual(unsavedEdits, false)

// The blank workbook has the right sheets and headers, and importing it leaves a blank account.
const blank = starterWorkbook(false)
assert.strictEqual(blank.SheetNames.join(), 'Overview,Plans,People,Actions,Notes')
assert.strictEqual(XLSX.utils.sheet_to_json(blank.Sheets.People, { header: 1 })[0].join(), 'ID,Name,Title,Department,ReportsTo,Notes')
state = emptyState()
importWorkbook(blank, 'account-template.xlsx')
assert.strictEqual(state.stakeholders.length, 0)
assert.strictEqual(state.account.account_name, '')
console.log('start: ok')
`
vm.runInNewContext(src, sandbox)
