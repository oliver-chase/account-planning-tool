'use strict';
// The Plan page's plan fields: the account's current plan, created the first time one is filled in.
// The current plan is the one with the latest year. It is created the first time a field is filled in with a value, so
// a new account never starts with an empty plan to manage.
const PLAN_HEADER_TEXT_FIELDS = [['objective', 'Objective'], ['strategy', 'Strategy'], ['revenue_target', 'Revenue target'], ['risks_summary', 'Risks and watch items']]
const PLAN_HEADER_DATE_FIELDS = [['last_reviewed_at', 'Last reviewed'], ['next_review_at', 'Next review']]

function currentPlan() { return [...state.plans].sort((a, b) => String(b.year).localeCompare(String(a.year)))[0] || null }

function setPlanField(field, value) {
  let plan = currentPlan()
  if (!plan && !value) return // clearing a field that has no plan yet creates nothing
  if (!plan) {
    const year = String(new Date().getFullYear())
    plan = { id: uid('plan'), year, objective: '', revenue_target: '', strategy: '', risks_summary: '', last_reviewed_at: '', next_review_at: '' }
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
    input.addEventListener('change', () => { setPlanField(field, input.value) })
    cell.appendChild(lab); cell.appendChild(input)
    grid.appendChild(cell)
  })
  card.appendChild(grid)
  parent.appendChild(card)
}
