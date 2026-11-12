'use strict'
// A person with any extra field set is flagged, and the Actions filters keep the right rows.
// Run: node tests/light-people.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert')
const root = path.join(__dirname, '..')
const sandbox = { assert, console, localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => null }, window: { addEventListener() {} }, setTimeout, clearTimeout }
const src = ['js/state.js', 'js/actions.js', 'js/people.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n') + `
// A person with nothing in the extra fields shows no marker; any value in them does.
const base = { sentiment: 'Unknown', worker_type: 'Client Employee', is_executive: 'false', primary_owner: '', secondary_owner: '', engagement: '' }
assert.strictEqual(!!hasExtraPersonFields(base), false)
for (const change of [{ sentiment: 'Positive' }, { worker_type: 'Contractor' }, { is_executive: 'true' }, { primary_owner: 'Ada' }, { secondary_owner: 'Bo' }, { engagement: 'Rollout' }])
  assert.strictEqual(!!hasExtraPersonFields({ ...base, ...change }), true, JSON.stringify(change))

// Overdue and due-this-week.
const t = '2026-11-11'
const a = (status, due) => ({ status, due_date: due })
assert.strictEqual(isoPlusDays(t, 7), '2026-11-18')
assert.strictEqual(isoPlusDays('2026-12-28', 7), '2027-01-04', 'rolls over the year')
assert.strictEqual(actionMatchesFilter(a('Open', '2026-11-10'), 'overdue', t), true)
assert.strictEqual(actionMatchesFilter(a('Open', t), 'overdue', t), false, 'due today is not overdue')
assert.strictEqual(actionMatchesFilter(a('Done', '2026-11-01'), 'overdue', t), false, 'finished work is never overdue')
assert.strictEqual(actionMatchesFilter(a('Open', ''), 'overdue', t), false, 'no date, not overdue')
assert.strictEqual(actionMatchesFilter(a('In Progress', t), 'due-week', t), true)
assert.strictEqual(actionMatchesFilter(a('Open', '2026-11-18'), 'due-week', t), true)
assert.strictEqual(actionMatchesFilter(a('Open', '2026-11-19'), 'due-week', t), false)
assert.strictEqual(actionMatchesFilter(a('Open', '2026-11-10'), 'due-week', t), false, 'overdue is its own filter')
assert.strictEqual(actionMatchesFilter(a('Done', t), 'due-week', t), false)
assert.strictEqual(actionMatchesFilter(a('Open', ''), 'open-progress', t), true)
assert.strictEqual(actionMatchesFilter(a('Done', ''), 'Done', t), true)
assert.ok(ACT_FILTER_OPTS.some(o => o[0] === 'overdue') && ACT_FILTER_OPTS.some(o => o[0] === 'due-week'))
// Deleting a manager frees the people who reported to them.
state.stakeholders = [{ id: 'm', name: 'Boss', reports_to: '' }, { id: 'r', name: 'Report', reports_to: 'm' }]
deletePerson(state.stakeholders[0])
assert.strictEqual(state.stakeholders.length, 1)
assert.strictEqual(state.stakeholders[0].reports_to, '', 'no manager left pointing at a deleted id')
console.log('light-people: ok')
`
vm.runInNewContext(src, sandbox)
