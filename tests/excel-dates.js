'use strict'
// Dates in a workbook written by something other than SheetJS (a real Excel date format) import
// as the day they show, in any time zone.
// Run: node tests/excel-dates.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert'), cp = require('child_process')
const root = path.join(__dirname, '..')
const read = f => fs.readFileSync(path.join(root, f), 'utf8')

if (process.argv[2] !== '--child') {
  for (const tz of ['UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Europe/Berlin', 'America/New_York', 'Asia/Kolkata']) {
    cp.execFileSync(process.execPath, [__filename, '--child'], { env: { ...process.env, TZ: tz }, stdio: 'pipe' })
  }
  console.log('excel-dates: ok')
  process.exit(0)
}

const XLSX = require(path.join(root, 'js/xlsx.full.min.js'))
const fixture = fs.readFileSync(path.join(root, 'tests/fixtures/excel-dates.xlsx'))
const file = { name: 'fixture.xlsx', arrayBuffer: async () => fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength) }
const store = {}
const sandbox = { assert, console, XLSX, file, process, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v) } },
  document: { getElementById: () => null }, window: { addEventListener() {} }, setTimeout, clearTimeout,
  renderAll() {}, showToast() {}, showModal: async () => ({ buttonValue: 'confirm' }), persistFileHandle() {}, forgetPersistedFileHandle() {}, resetOverviewCadenceUI() {} }
vm.runInNewContext(['js/state.js', 'js/excel.js'].map(read).join('\n') + `
// The production import path reads the file, so a lost cellDates flag shows up here.
;(async () => {
assert.ok(await loadWorkbookFromFile(file, null))
const s = state
assert.strictEqual(s.account.account_name, 'Date Fixture Co')
assert.strictEqual(s.actions.length, 2)
assert.strictEqual(s.actions[0].due_date, '2026-11-20')
assert.strictEqual(s.actions[1].due_date, '2026-01-01')
})().catch(e => { console.error(e); process.exit(1) })
`, sandbox)
