'use strict'
// The workbook stores each date as an Excel date cell, so Excel sorts and filters it as a date, and it
// opens again as the same day in any time zone.
// Run: node tests/date-cells.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert'), cp = require('child_process')
const root = path.join(__dirname, '..')
const read = f => fs.readFileSync(path.join(root, f), 'utf8')

if (process.argv[2] !== '--child') {
  for (const tz of ['UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Europe/Berlin', 'America/New_York', 'Asia/Kolkata']) {
    cp.execFileSync(process.execPath, [__filename, '--child'], { env: { ...process.env, TZ: tz }, stdio: 'pipe' })
  }
  console.log('date-cells: ok')
  process.exit(0)
}

const XLSX = require(path.join(root, 'js/xlsx.full.min.js'))
const store = {}
const sandbox = { assert, console, XLSX, process, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v) } },
  document: { getElementById: () => null }, window: { addEventListener() {} }, setTimeout, clearTimeout,
  renderAll() {}, showToast() {}, showModal: async () => ({ buttonValue: 'confirm' }), persistFileHandle() {}, forgetPersistedFileHandle() {}, resetOverviewCadenceUI() {} }
vm.runInNewContext(['js/state.js', 'js/excel.js', 'js/start.js'].map(read).join('\n') + `
;(async () => {
startNewAccount('Date Co', 'Ada', 'CEO')
state.actions.push({ id: 'a1', description: 'Send deck', owner: 'Ada', engagement: '', status: 'Done', due_date: '2026-11-20', closed_date: '2026-11-18', created_date: '2026-01-01', last_updated: '2026-11-18' })
state.actions.push({ id: 'a2', description: 'No date', owner: '', engagement: '', status: 'Open', due_date: '', closed_date: '', created_date: '2026-03-02', last_updated: '2026-03-02' })
state.notes.push({ id: 'n1', date: '2026-11-03', type: 'Meeting', title: 'Kickoff', attendees: [], body: 'x', transcript_link: '', created_date: '2026-11-03', last_updated: '2026-11-03' })
if (!state.plans.length) state.plans.push(newPlan())
state.plans[0].last_reviewed_at = '2026-11-03'; state.plans[0].next_review_at = '2026-12-01'
state.background.next_meeting_override = '2026-12-09'
const before = JSON.stringify({ a: state.actions, n: state.notes, p: state.plans, o: state.background.next_meeting_override })

const wb = buildWorkbook()
// Every date is a number cell with a date format, and an empty date stays empty.
const cell = (sheet, addr) => wb.Sheets[sheet][addr]
const hdr = (sheet, h) => String.fromCharCode(65 + SHEET_HEADERS[sheet].indexOf(h))
const due = cell('Actions', hdr('Actions', 'DueDate') + '2')
assert.strictEqual(due.t, 'n'); assert.strictEqual(due.z, 'yyyy-mm-dd')
assert.strictEqual(due.v, 46346) // 2026-11-20 as an Excel serial number
assert.strictEqual(cell('Actions', hdr('Actions', 'CreatedDate') + '3').t, 'n')
assert.ok(!cell('Actions', hdr('Actions', 'DueDate') + '3') || cell('Actions', hdr('Actions', 'DueDate') + '3').t !== 'n')
assert.strictEqual(cell('Notes', hdr('Notes', 'Date') + '2').t, 'n')
assert.strictEqual(cell('Plans', hdr('Plans', 'NextReviewAt') + '2').t, 'n')
const ov = XLSX.utils.sheet_to_json(wb.Sheets.Overview, { header: 1 }).findIndex(r => r[0] === 'Next Meeting Override')
assert.strictEqual(wb.Sheets.Overview['B' + (ov + 1)].t, 'n')

// It saves, opens again and holds the same days.
const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
const file = { name: 'x.xlsx', arrayBuffer: async () => buf }
assert.ok(await loadWorkbookFromFile(file, null))
assert.strictEqual(JSON.stringify({ a: state.actions, n: state.notes, p: state.plans, o: state.background.next_meeting_override }).replace(/"last_updated":"[^"]*"/g, ''), before.replace(/"last_updated":"[^"]*"/g, ''))
})().catch(e => { console.error(e); process.exit(1) })
`, sandbox)
