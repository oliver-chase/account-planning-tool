'use strict'
// The Plans sheet survives an import and a save unchanged.
// Run: node tests/passthrough.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert')
const root = path.join(__dirname, '..')
const XLSX = require(path.join(root, 'js/xlsx.full.min.js'))
const rows = { Overview: [['Field', 'Value'], ['Account Name', 'Acme']],
  Plans: [['ID', 'Year', 'Objective', 'RevenueTarget', 'Strategy', 'RisksSummary', 'LastReviewedAt', 'NextReviewAt'], ['pl1', '2027', 'Grow', '$1M', 'Land', 'Budget', '2026-10-01', '2026-12-01']] }
const wb = XLSX.utils.book_new()
Object.keys(rows).forEach(n => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows[n]), n))
const store = {}
const sandbox = { assert, console, XLSX, wb, rows, process, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v) } },
  document: { getElementById: () => null }, window: { addEventListener() {} }, setTimeout, clearTimeout,
  renderAll() {}, showToast() {}, showModal: async () => ({ buttonValue: 'confirm' }), persistFileHandle() {}, forgetPersistedFileHandle() {}, resetOverviewCadenceUI() {} }
vm.runInNewContext(['js/state.js', 'js/excel.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n') + `
importWorkbook(wb, 'old.xlsx')
const out = buildWorkbook()
for (const name of Object.keys(rows).filter(n => n !== 'Overview')) {
  assert.ok(out.SheetNames.includes(name), name + ' is written back')
  const back = XLSX.utils.sheet_to_json(out.Sheets[name], { header: 1, defval: '' })
  assert.strictEqual(JSON.stringify(back.map(r => r.map(String))), JSON.stringify(rows[name].map(r => r.map(String))), name + ' comes back unchanged')
}
console.log('passthrough: ok')
`, sandbox)
