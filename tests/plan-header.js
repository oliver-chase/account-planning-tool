'use strict'
// The Plan page edits the account's current plan, and creates it on first use.
// Run: node tests/plan-header.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert')
const root = path.join(__dirname, '..')
const store = {}
const sandbox = { assert, console, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v) } },
  document: { getElementById: () => null }, window: { addEventListener() {} }, setTimeout, clearTimeout }
const src = ['js/state.js', 'js/plan.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n') + `
assert.strictEqual(currentPlan(), null, 'a new account has no plan to manage')
state.account.account_name = 'Acme'
setPlanField('objective', 'Grow in EMEA')
assert.strictEqual(state.plans.length, 1)
assert.strictEqual(currentPlan().objective, 'Grow in EMEA')
assert.strictEqual(currentPlan().year, String(new Date().getFullYear()))
setPlanField('next_review_at', '2026-12-01')
setPlanField('risks_summary', 'Budget freeze')
assert.strictEqual(state.plans.length, 1, 'later edits reuse the same plan')
assert.strictEqual(currentPlan().next_review_at + '|' + currentPlan().risks_summary, '2026-12-01|Budget freeze')
assert.strictEqual(PLAN_HEADER_TEXT_FIELDS.concat(PLAN_HEADER_DATE_FIELDS).map(f => f[0]).join(), 'objective,strategy,revenue_target,risks_summary,last_reviewed_at,next_review_at')
// The plan with the latest year is current, wherever it sits in the list.
state.plans = [{ id: 'older', year: '2025', objective: 'a' }, { id: 'newer', year: '2027', objective: 'b' }, { id: 'mid', year: '2026', objective: 'c' }]
assert.strictEqual(currentPlan().id, 'newer')
// The review flag: overdue, due soon, stale, or nothing.
const rs = (plan, t) => planReviewStatus(plan, t || '2026-11-17')
assert.deepStrictEqual(rs({ next_review_at: '2026-11-10' }), { level: 'overdue', text: 'Review overdue by 7 days' })
assert.strictEqual(rs({ next_review_at: '2026-11-16' }).text, 'Review overdue by 1 day')
assert.deepStrictEqual(rs({ next_review_at: '2026-11-17' }), { level: 'soon', text: 'Review due today' })
assert.strictEqual(rs({ next_review_at: '2026-11-18' }).text, 'Review due in 1 day')
assert.strictEqual(rs({ next_review_at: '2026-11-24' }).text, 'Review due in 7 days')
assert.strictEqual(rs({ next_review_at: '2026-11-25' }).level, '', 'more than a week out says nothing')
assert.strictEqual(rs({ next_review_at: '2026-11-10T00:00:00' }).level, 'overdue', 'a stored time of day is ignored')
assert.strictEqual(rs({ last_reviewed_at: '2026-10-18' }).level, '', '30 days is not yet stale')
assert.deepStrictEqual(rs({ last_reviewed_at: '2026-10-17' }), { level: 'stale', text: 'Not reviewed in 31 days' })
assert.strictEqual(rs({ next_review_at: '2027-01-01', last_reviewed_at: '2026-01-01' }).level, '', 'a future review date wins over an old last-reviewed date')
assert.strictEqual(rs({}).level, ''); assert.strictEqual(rs(null).level, '')
console.log('plan-header: ok')
`
vm.runInNewContext(src, sandbox)
