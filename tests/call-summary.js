'use strict'
// The call summary and the Export menu.
// Run: node tests/call-summary.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert')
const root = path.join(__dirname, '..')
const store = {}
const sandbox = { assert, console, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v) } },
  document: { getElementById: () => null }, window: { addEventListener() {} }, setTimeout, clearTimeout }
const src = ['js/state.js', 'js/brand.js', 'js/plan.js', 'js/actions.js', 'js/export.js', 'js/call-summary.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n') + `
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
state.account.account_name = 'Acme <Co>'
state.notes = [
  { id: 'n1', date: iso(-30), title: 'Old call', attendees: [], body: 'Ignore me' },
  { id: 'n2', date: iso(-2), title: 'Quarterly check-in', attendees: ['Ada', 'Bo'], body: 'Ada wants the plan by Friday.\\nBo needs the checklist.' },
]
state.actions = [
  { id: 'a1', description: 'Send proposal', owner: 'Ada', status: 'In Progress', due_date: iso(5) },
  { id: 'a2', description: 'Book review', owner: 'Ada', status: 'Open', due_date: iso(-3) },
  { id: 'a3', description: 'Loose end', owner: '', status: 'Open', due_date: '' },
  { id: 'a4', description: 'Shipped deck', owner: 'Bo', status: 'Done', closed_date: iso(-1), due_date: '' },
  { id: 'a5', description: 'Long ago', owner: 'Bo', status: 'Done', closed_date: iso(-40), due_date: '' },
]
state.plans = [{ id: 'p', name: 'FY27', objective: 'Win the renewal', strategy: '', revenue_target: '$1M', risks_summary: 'Budget freeze', next_review_at: '2026-12-01' }]
const s = buildCallSummary()
assert.ok(s.text.startsWith('Acme <Co> — call summary'), 'title first')
assert.ok(/Objective: Win the renewal/.test(s.text) && s.text.includes('Revenue target: $1M') && /Risks and watch items: Budget freeze/.test(s.text), 'the plan fields are in the text')
assert.ok(!/Strategy:/.test(s.text), 'an empty plan field is left out')
assert.ok(s.html.includes('<h2>Plan</h2>') && s.html.includes('Win the renewal'), 'and in the page')
assert.ok(s.text.includes('Quarterly check-in') && !s.text.includes('Ignore me'), 'only the latest call is included')
assert.ok(s.text.includes('Attendees: Ada, Bo') && s.text.includes('Bo needs the checklist.'))
const text = s.text
assert.ok(text.indexOf('Book review') < text.indexOf('Send proposal'), 'earliest due date first within an owner')
assert.ok(/Book review \\(overdue, was due/.test(text) && /Send proposal \\(due/.test(text))
assert.ok(text.indexOf('Ada') < text.indexOf('No owner') && text.indexOf('Loose end') > text.indexOf('No owner'), 'unowned actions come last')
assert.ok(text.includes('Shipped deck') && !text.includes('Long ago'), 'finished this week only')
assert.ok(s.html.includes('Acme &lt;Co&gt;') && !s.html.includes('Acme <Co>'), 'html is escaped')
assert.ok(/call-summary-\\d{4}-\\d{2}-\\d{2}\\.html$/.test(s.fileName))

state.notes = []; state.actions = []
assert.ok(buildCallSummary().text.includes('None.'), 'an empty account still produces a summary')

assert.strictEqual(exportMenuEntries().map(e => e.label).join(), 'Call summary,Org chart picture', 'call summary comes first')
console.log('call-summary: ok')
`
vm.runInNewContext(src, sandbox)
