'use strict';
// The Plan page's plan fields: the account's current plan, created the first time one is filled in.
// The current plan is the one with the latest year. It is created the first time a field is filled in with a value, so
// a new account never starts with an empty plan to manage.
const PLAN_HEADER_TEXT_FIELDS = [['objective', 'Objective'], ['strategy', 'Strategy'], ['revenue_target', 'Revenue target'], ['risks_summary', 'Risks and watch items']]
const PLAN_HEADER_DATE_FIELDS = [['last_reviewed_at', 'Last reviewed'], ['next_review_at', 'Next review']]

// A plan with no review date is called stale once it has gone this many days since it was last reviewed.
const PLAN_STALE_DAYS = 30
const PLAN_REVIEW_SOON_DAYS = 7

function planDaysBetween(from, to) { return Math.round((new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000) }
const planDays = n => n + (n === 1 ? ' day' : ' days')

// Whether the plan's review needs attention on a day: {level, text}, where level is overdue, soon or stale,
// or {level: '', text: ''} when nothing needs saying. A Next review date decides when there is one, and
// without it the Last reviewed date decides.
function planReviewStatus(plan, t) {
  const next = String((plan || {}).next_review_at || '').slice(0, 10), last = String((plan || {}).last_reviewed_at || '').slice(0, 10)
  if (next) {
    const d = planDaysBetween(t, next)
    if (d < 0) return { level: 'overdue', text: 'Review overdue by ' + planDays(-d) }
    if (d === 0) return { level: 'soon', text: 'Review due today' }
    if (d <= PLAN_REVIEW_SOON_DAYS) return { level: 'soon', text: 'Review due in ' + planDays(d) }
    return { level: '', text: '' }
  }
  if (last) {
    const d = planDaysBetween(last, t)
    if (d > PLAN_STALE_DAYS) return { level: 'stale', text: 'Not reviewed in ' + planDays(d) }
  }
  return { level: '', text: '' }
}

function currentPlan() { return [...state.plans].sort((a, b) => String(b.year).localeCompare(String(a.year)))[0] || null }

function setPlanField(field, value) {
  let plan = currentPlan()
  if (!plan && !value) return // clearing a field that has no plan yet creates nothing
  if (!plan) {
    plan = newPlan()
    state.plans.unshift(plan)
  }
  plan[field] = value
  persist()
}

function renderPlanHeader(parent) {
  const plan = currentPlan() || {}
  const card = el('div', 'app-card plan-header-card', null)
  card.appendChild(el('div', 'app-card-label', 'Plan'))
  const grid = el('div', 'plan-header-grid', null)
  PLAN_HEADER_TEXT_FIELDS.forEach(([field, label]) => {
    const cell = el('div', 'plan-header-cell', null)
    cell.appendChild(el('div', 'overview-stat-label', label))
    cell.appendChild(editable('div', 'content-editable-cell fontSmall', plan[field] || '', 'Click to edit…', v => {
      if (v === (plan[field] || '')) return
      setPlanField(field, v); renderOverview()
    }, { multiline: true, ariaLabel: label }))
    grid.appendChild(cell)
  })
  PLAN_HEADER_DATE_FIELDS.forEach(([field, label]) => {
    const cell = el('div', 'plan-header-cell', null)
    const id = 'plan-' + field
    const lab = el('label', 'overview-stat-label', label); lab.htmlFor = id
    const input = el('input', 'overview-date-input', null)
    input.type = 'date'; input.id = id; input.value = String(plan[field] || '').slice(0, 10)
    cell.appendChild(lab); cell.appendChild(input)
    // The flag sits under the date that drives it and follows an edit to either date.
    const flag = el('div', 'overview-stat-sublabel', null)
    flag.setAttribute('role', 'status')
    const showFlag = () => {
      const s = planReviewStatus(currentPlan(), today())
      flag.textContent = s.text
      flag.className = 'overview-stat-sublabel' + (s.level === 'overdue' ? ' action-age-overdue' : '')
    }
    input.addEventListener('change', () => { setPlanField(field, input.value); showFlag() })
    if (field === 'next_review_at') { cell.appendChild(flag); showFlag() }
    grid.appendChild(cell)
  })
  card.appendChild(grid)
  parent.appendChild(card)
}
