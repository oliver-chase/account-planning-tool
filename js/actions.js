'use strict';
// Actions: a sortable, filterable list of what is owed, with owners and due dates.

let actionsSortCol = 'due_date'
let actionsSortDir = 'asc'
let actionsAdding = false
let actionsStatusFilter = 'open-progress'
const ACT_FILTER_OPTS = [['open-progress', 'Open + in progress'], ['overdue', 'Overdue'], ['due-week', 'Due this week'], ['all', 'All statuses'], ['Open', 'Open only'], ['Done', 'Done only']]

function isPastDue(a, t) { return a.status !== 'Done' && !!a.due_date && a.due_date < t }

// Which actions a status filter keeps. Overdue and due-this-week look only at unfinished
// actions that have a due date.
function actionMatchesFilter(a, filter, t) {
  if (filter === 'open-progress') return a.status === 'Open' || a.status === 'In Progress'
  if (filter === 'all') return true
  if (filter === 'overdue') return isPastDue(a, t)
  if (filter === 'due-week') return a.status !== 'Done' && !!a.due_date && a.due_date >= t && a.due_date <= isoPlusDays(t, 7)
  return a.status === filter
}

function dayAge(dateStr) { if (!dateStr) return 0; return Math.round((Date.now() - new Date(dateStr + 'T00:00:00').getTime()) / 86400000) }
function actionStatusBadgeClass(s) { if (s === 'Done') return 'app-badge-complete'; if (s === 'In Progress') return 'app-badge-progress'; return 'app-badge-open' }

// Edits read the stored record, so two saves close together both keep their change.
const currentAction = a => state.actions.find(x => x.id === a.id) || a
function saveAction(a) { a.last_updated = today(); const i = state.actions.findIndex(x => x.id === a.id); if (i >= 0) state.actions[i] = a; persist() }
function deleteAction(a, rerender) { deleteWithUndo('actions', a, 'Action', rerender) }

// Sorts by a column. Actions with no due date always come last, whichever way the sort runs.
function sortActions(list, col, dir) {
  return [...list].sort((a, b) => {
    const av = a[col] || '', bv = b[col] || ''
    if (col === 'due_date' && (!av || !bv)) return av === bv ? 0 : !av ? 1 : -1
    return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
  })
}

function renderActions() { renderKeepingFocus('actions-body-wrap', renderActionsBody) }

function renderActionsBody() {
  const root = document.getElementById('actions-body-wrap')
  root.innerHTML = ''

  const header = el('div', 'app-section-header', null)
  header.appendChild(el('div', 'app-section-title', 'Actions'))
  const row2 = el('div', 'section-header-row2', null)
  const left = el('div', 'section-header-left', null)
  left.appendChild(inlineActionButton('Add action', () => { actionsAdding = true; renderActions() }, { id: 'btn-add-action' }))
  row2.appendChild(left)
  const actionsWrap = el('div', 'module-section-actions module-section-actions-scroll', null)
  actionsWrap.appendChild(singleSelectEl(ACT_FILTER_OPTS, actionsStatusFilter, v => { actionsStatusFilter = v; if (v === 'overdue' || v === 'due-week') { actionsSortCol = 'due_date'; actionsSortDir = 'asc' } renderActions() }, 'sort-select'))
  row2.appendChild(actionsWrap)
  header.appendChild(row2)
  root.appendChild(header)

  let actions = state.actions.filter(a => {
    if (globalFilterSearch && !(a.description || '').toLowerCase().includes(globalFilterSearch.toLowerCase())) return false
    return actionMatchesFilter(a, actionsStatusFilter, today())
  })
  actions = sortActions(actions, actionsSortCol, actionsSortDir)

  const tableWrap = el('div', 'module-table-wrap', null)
  const table = el('table', 'module-data-table', null)
  const thead = el('thead', null, null)
  const thr = el('tr', null, null)
  function th(label, col) {
    const t = el('th', col && actionsSortCol === col ? 'sorted' : '', label + ' ')
    if (col) {
      t.style.cursor = 'pointer'
      t.appendChild(sortArrow(col))
      t.dataset.col = col
      // The table is rebuilt on every sort, so put keyboard focus back on the same header.
      const sortBy = () => {
        if (actionsSortCol === col) actionsSortDir = actionsSortDir === 'asc' ? 'desc' : 'asc'; else { actionsSortCol = col; actionsSortDir = 'asc' }
        renderActions()
        const again = document.querySelector('.module-data-table th[data-col="' + col + '"]')
        if (again) again.focus()
      }
      t.addEventListener('click', sortBy)
      makeActivatable(t, null, sortBy)
      t.setAttribute('aria-sort', actionsSortCol === col ? (actionsSortDir === 'asc' ? 'ascending' : 'descending') : 'none')
    }
    return t
  }
  thr.appendChild(th('Action', 'description')); thr.appendChild(th('Owner', 'owner')); thr.appendChild(th('Engagement', null)); thr.appendChild(th('Due', 'due_date')); thr.appendChild(th('Status', 'status')); thr.appendChild(el('th', 'action-th', null))
  thead.appendChild(thr); table.appendChild(thead)
  const tbody = el('tbody', null, null)

  if (actionsAdding) tbody.appendChild(makeInlineActionRow())
  if (!actions.length && !actionsAdding) { const tr = el('tr', null, null); const td = el('td', null, null); td.colSpan = 6; td.appendChild(emptyResultsBox(!state.actions.length ? 'No actions yet. Click Add action to start.' : actionsStatusFilter === 'open-progress' ? 'No open actions. Finished actions show under All statuses.' : 'No results')); tr.appendChild(td); tbody.appendChild(tr) }
  actions.forEach(a => tbody.appendChild(makeActionRow(a)))
  table.appendChild(tbody)
  tableWrap.appendChild(table)
  root.appendChild(tableWrap)

  const allActs = state.actions
  const openCount = allActs.filter(a => a.status === 'Open').length
  const inProg = allActs.filter(a => a.status === 'In Progress').length
  const parts = []
  if (openCount) parts.push(openCount + ' open')
  if (inProg) parts.push(inProg + ' in progress')
  root.appendChild(el('div', 'section-count-footer', parts.join(' · ')))
}

function sortArrow(col) {
  const dir = actionsSortCol === col ? actionsSortDir : 'desc'
  const s = el('span', 'module-sort-arrow', null)
  s.dataset.dir = dir
  return s
}

function makeActionRow(action) {
  const age = (action.status === 'Open' || action.status === 'In Progress') ? dayAge(action.created_date) : 0
  const tr = el('tr', (action.status === 'Done' ? 'done-row' : '') + (isPastDue(action, today()) ? ' action-row-overdue' : ''), null)
  const descTd = el('td', 'action-cell', null)
  descTd.appendChild(editable('span', 'action-text', action.description, '', v => { saveAction({ ...currentAction(action), description: v || action.description }); renderActions() }, { ariaLabel: 'Action' }))
  if (age >= 7) descTd.appendChild(el('span', 'action-age' + (age > 14 ? ' action-age-overdue' : ''), ' (' + age + 'd)'))
  tr.appendChild(descTd)
  const ownerTd = el('td', 'action-cell action-cell-nowrap', null)
  ownerTd.appendChild(personSelectEl(action.owner, v => { saveAction({ ...currentAction(action), owner: v }); renderActions() }, 'picker-btn-inline'))
  tr.appendChild(ownerTd)
  const engTd = el('td', 'action-cell', null)
  engTd.appendChild(editable('span', 'picker-btn-inline', action.engagement, 'Account-wide', v => { saveAction({ ...currentAction(action), engagement: v }); renderActions() }, { ariaLabel: 'Engagement' }))
  tr.appendChild(engTd)
  const dueTd = el('td', 'action-cell action-cell-nowrap', null)
  const dueInput = el('input', 'overview-date-input', null)
  dueInput.type = 'date'; dueInput.value = action.due_date || ''; dueInput.setAttribute('aria-label', 'Due date')
  dueInput.addEventListener('change', () => { saveAction({ ...currentAction(action), due_date: dueInput.value }); renderActions() })
  dueTd.appendChild(dueInput)
  tr.appendChild(dueTd)
  const statusTd = el('td', 'action-cell', null)
  statusTd.appendChild(singleSelectEl([['Open', 'Open'], ['In Progress', 'In Progress'], ['Done', 'Done']], action.status, v => { saveAction({ ...currentAction(action), status: v, closed_date: v === 'Done' ? today() : '' }); renderActions() }, 'picker-btn-status ' + actionStatusBadgeClass(action.status)))
  tr.appendChild(statusTd)
  const delTd = el('td', 'action-cell action-cell-compact', null)
  const delBtn = compactRemoveButton('Delete action', () => { deleteAction(action, renderActions) }, 'action-cell-delete-btn')
  delBtn.dataset.fk = 'del-' + action.id // a restore never lands on another action's button
  delTd.appendChild(delBtn)
  tr.appendChild(delTd)
  return tr
}

function makeInlineActionRow() {
  const rec = { id: uid('act'), description: '', owner: '', engagement: '', status: 'Open', due_date: '', closed_date: '', created_date: today(), last_updated: today() }
  const tr = el('tr', 'new-row', null)
  const descTd = el('td', 'action-cell', null)
  let discarded = false, committed = false
  // The action is stored as soon as it has a description. The row stays on screen until focus leaves it,
  // so the owner, date and status the person reaches next still land on the same action.
  const edit = apply => { apply(); rec.last_updated = today(); if (committed) persist() }
  const descEl = editable('span', 'action-text field-required-highlight', '', 'What needs to happen?', v => {
    if (discarded) return
    if (v) {
      rec.description = v
      if (!committed) { committed = true; actionsAdding = false; state.actions.unshift(rec) }
      if (!actionMatchesFilter(rec, actionsStatusFilter, today()) && !globalFilterSearch) actionsStatusFilter = 'all'
      persist()
    } else if (tr.isConnected && !newCardInUse(tr)) { actionsAdding = false; renderActions() }
  }, { alwaysSave: true, ariaLabel: 'New action' })
  descTd.appendChild(descEl); tr.appendChild(descTd)
  const ownerTd = el('td', 'action-cell action-cell-nowrap', null)
  ownerTd.appendChild(personSelectEl('', v => edit(() => { rec.owner = v }), 'picker-btn-inline'))
  tr.appendChild(ownerTd)
  tr.appendChild(el('td', 'action-cell', null))
  const dueTd = el('td', 'action-cell action-cell-nowrap', null)
  const dueInput = el('input', 'overview-date-input', null)
  dueInput.type = 'date'; dueInput.setAttribute('aria-label', 'Due date')
  dueInput.addEventListener('change', () => edit(() => { rec.due_date = dueInput.value }))
  dueTd.appendChild(dueInput)
  tr.appendChild(dueTd)
  const statusTd = el('td', 'action-cell', null)
  statusTd.appendChild(singleSelectEl([['Open', 'Open'], ['In Progress', 'In Progress'], ['Done', 'Done']], 'Open', v => edit(() => { rec.status = v; rec.closed_date = v === 'Done' ? today() : '' }), 'picker-btn-status ' + actionStatusBadgeClass('Open')))
  tr.appendChild(statusTd)
  const delTd = el('td', 'action-cell action-cell-compact', null)
  delTd.appendChild(compactRemoveButton('Discard action changes', () => {
    discarded = true; actionsAdding = false
    if (committed) deleteWithUndo('actions', rec, 'Action', renderActions)
    else renderActions()
  }, 'action-cell-delete-btn'))
  tr.appendChild(delTd)
  // Once focus has left the row for good, show the action as an ordinary row.
  tr.addEventListener('focusout', () => setTimeout(() => {
    if (committed && !discarded && tr.isConnected && !tr.contains(document.activeElement) && !document.querySelector('.app-popover')) renderActions()
  }, 350))
  setTimeout(() => descEl.focus(), 0)
  return tr
}
