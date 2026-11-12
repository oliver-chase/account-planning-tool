'use strict'
// Dates, money, the next meeting and seniority are computed correctly, in any time zone.
// Run: node tests/calc.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert'), cp = require('child_process')
const root = path.join(__dirname, '..')
const read = f => fs.readFileSync(path.join(root, f), 'utf8')

if (process.argv[2] !== '--child') {
  // The same checks run in zones far east and west of UTC, where toISOString() gives the wrong day.
  for (const tz of ['UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Europe/Berlin', 'America/New_York']) {
    cp.execFileSync(process.execPath, [__filename, '--child'], { env: { ...process.env, TZ: tz }, stdio: 'pipe' })
  }
  console.log('calc: ok')
  process.exit(0)
}

const store = {}
const sandbox = { assert, console, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v) } },
  document: { getElementById: () => null }, window: { addEventListener() {} }, setTimeout, clearTimeout }
const src = ['js/state.js', 'js/overview.js'].map(read).join('\n') + `
// Dates are local calendar days.
assert.strictEqual(localISO(new Date(2026, 10, 11, 23, 30)), '2026-11-11')
assert.strictEqual(localISO(new Date(2026, 10, 11, 0, 10)), '2026-11-11')

// Money.
const money = { '$450K': 450000, '$1.2M': 1200000, '1,200,000': 1200000, '2.5B': 2.5e9, '450': 450, '': 0, 'n/a': 0, '$3m': 3e6, '$1.2 million': 1.2e6, '450-500K': 450000, 'FY24 $450K': 450000, 'Q3 target $450K': 450000, '2 mill': 2e6, '$2 millions': 2e6, '$3 billions': 3e9, '$2 mil': 2e6, '1 000 000': 1e6, '$2 bil': 2e9, '450 thousand': 450000, '$2.5 billion': 2.5e9, '12 mm': 12e6, '$450,000': 450000 }
for (const [k, v] of Object.entries(money)) assert.strictEqual(parseMoney(k), v, k)
assert.strictEqual(parseMoney(null), 0)

// Months clamp to the end of a short month.
assert.strictEqual(isoPlusMonths('2026-01-31', 1), '2026-02-28')
assert.strictEqual(isoPlusMonths('2028-01-31', 1), '2028-02-29')
assert.strictEqual(isoPlusMonths('2026-11-30', 3), '2027-02-28')
assert.strictEqual(isoPlusMonths('2026-12-15', 1), '2027-01-15')

// The next meeting follows the interval and is never in the past.
const note = d => [{ date: d }]
assert.strictEqual(computeNextMeeting({ meeting_frequency: 'weekly', meeting_interval: '3' }, note('2026-10-01'), '2026-11-11'), '2026-11-12')
assert.strictEqual(computeNextMeeting({ meeting_frequency: 'weekly', meeting_interval: '1', meeting_day: 'Mon' }, note('2026-11-04'), '2026-11-11'), '2026-11-16')
assert.strictEqual(computeNextMeeting({ meeting_frequency: 'monthly', meeting_interval: '1' }, note('2026-01-31'), '2026-02-15'), '2026-02-28')
assert.strictEqual(computeNextMeeting({ meeting_frequency: 'quarterly', meeting_interval: '1' }, note('2026-01-31'), '2026-06-01'), '2026-07-31')
assert.strictEqual(computeNextMeeting({ meeting_frequency: 'weekly', meeting_interval: '1', meeting_day: 'Wed' }, note('2026-11-09'), '2026-11-10'), '2026-11-11', 'the first meeting day after the last call')
const old = computeNextMeeting({ meeting_frequency: 'weekly', meeting_interval: '1' }, note('2026-01-05'), '2026-11-11')
assert.ok(old >= '2026-11-11' && old <= '2026-11-18', 'an old last note still projects a future date: ' + old)
assert.strictEqual(computeNextMeeting({ meeting_frequency: '' }, note('2026-01-05'), '2026-11-11'), null)

// Seniority.
const order = ['Chief Executive Officer', 'SVP Sales', 'VP Operations', 'IT Director', 'Account Manager', 'Analyst', ''].map(titleRank)
assert.strictEqual(order.join(), '1,2,3,4,5,6,7')
assert.strictEqual(['Vice President, Sales', 'Executive Vice President', 'President', 'Chief of Staff'].map(titleRank).join(), '3,2,1,1', 'a vice president ranks below the chief level')
assert.strictEqual(['Sr. Vice President', 'CIO', 'Process Owner'].map(titleRank).join(), '2,1,6', 'Sr VP, CIO and a process owner rank sensibly')


// Two revenue saves in a row both survive, because each patch reads the stored record when it saves.
state.background.revenue = { 2026: { projected: '1', closed: '' } }
const first = revenuePatch('2026', { projected: '2' }); state.background = { ...state.background, ...first }
state.background = { ...state.background, ...revenuePatch('2026', { closed: '3' }) }
assert.deepStrictEqual(JSON.parse(JSON.stringify(state.background.revenue['2026'])), { projected: '2', closed: '3' })
`
vm.runInNewContext(src, sandbox)
