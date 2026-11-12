'use strict';
// People: cards and an org chart view, with filters, sort and paging.

const PEOPLE_PAGE_SIZE = 6
let peopleView = 'cards'
let peopleSort = 'name'
let peoplePage = 0
let peopleAdding = false
// Fields kept out of the default card. The card shows a dot on "More fields" when any of
// them holds a value, so nothing set earlier is hidden without a sign.
function hasExtraPersonFields(p) {
  return (p.sentiment && p.sentiment !== 'Unknown') || (p.worker_type && p.worker_type !== 'Client Employee') ||
    isExec(p) || !!p.primary_owner || !!p.secondary_owner || !!p.engagement
}
const peopleMoreOpen = new Set()
const isExec = p => p.is_executive === 'true' || p.is_executive === 'TRUE'

let peopleFilters = { exec: false, incomplete: false, ownerFilter: '' }
let peopleFilterPanelOpen = false

// Asks, deletes, and closes the side panel, which would otherwise show a person who is gone.
function confirmDeletePerson(person) {
  showModal({ title: 'Delete ' + (person.name || 'person') + '?', confirmLabel: 'Delete', dangerConfirm: true }).then(r => {
    if (r.buttonValue !== 'confirm') return
    deletePerson(person)
    document.querySelectorAll('.person-detail-panel').forEach(p => p.remove())
    if (personPanelOnKey) document.removeEventListener('keydown', personPanelOnKey)
    renderPeople()
  })
}

function savePerson(p) {
  const title = document.querySelector('#org-person-panel[data-person-id="' + p.id + '"] .person-detail-title')
  if (title) title.textContent = p.name || 'Person'
  p.last_updated = today(); const i = state.stakeholders.findIndex(x => x.id === p.id); if (i >= 0) state.stakeholders[i] = p; persist() }
function deletePerson(p) {
  state.stakeholders = state.stakeholders.filter(x => x.id !== p.id)
  state.stakeholders.forEach(x => { if (x.reports_to === p.id) x.reports_to = '' })
  persist()
}

const SENTIMENT_OPTS = ['Champion', 'Supporter', 'Neutral', 'Detractor', 'Unknown']
// A small colored dot; the color comes from a CSS custom property named by the caller.
function statusDot(colorVar, title) {
  const dot = el('span', 'status-dot', null)
  dot.style.background = 'var(' + colorVar + ')'
  dot.title = title
  return dot
}
function sentimentDot(sentiment) { return statusDot('--color-sentiment-' + (sentiment || 'Unknown').toLowerCase(), sentiment || 'Unknown') }

// Who this person works for: the client, this firm's own staff placed in the client's org chart,
// or a third-party contractor. A directory export never carries this, so it is set by hand and
// kept apart from Sentiment.
const WORKER_TYPE_OPTS = ['Client Employee', 'Internal Staff', 'Contractor']
// CSS custom properties are named by a short slug, since a label with a space cannot be one.
const WORKER_TYPE_SLUG = { 'Client Employee': 'client', 'Internal Staff': 'internal', 'Contractor': 'contractor' }
function workerTypeSlug(workerType) { return WORKER_TYPE_SLUG[workerType] || 'client' }
function workerTypeDot(workerType) { return statusDot('--color-worker-' + workerTypeSlug(workerType), workerType || 'Client Employee') }

function filteredPeople() {
  let people = [...state.stakeholders]
  if (globalFilterSearch) { const q = globalFilterSearch.toLowerCase(); people = people.filter(s => (s.name || '').toLowerCase().includes(q)) }
  if (peopleFilters.exec) people = people.filter(isExec)
  if (peopleFilters.incomplete) people = people.filter(s => !s.department || !s.primary_owner || !s.secondary_owner)
  if (peopleFilters.ownerFilter) people = people.filter(s => s.primary_owner === peopleFilters.ownerFilter || s.secondary_owner === peopleFilters.ownerFilter)
  people.sort((a, b) => {
    if (peopleSort === 'department') return (a.department || '').localeCompare(b.department || '')
    if (peopleSort === 'seniority') return titleRank(a.title) - titleRank(b.title) || (a.name || '').localeCompare(b.name || '')
    return a.name.localeCompare(b.name)
  })
  return people
}

function renderPeople() {
  orgPickedId = null // a card picked earlier must not move on a later click
  renderKeepingFocus('people-body', renderPeopleBody)
}

function renderPeopleBody() {
  const root = document.getElementById('people-body')
  root.innerHTML = ''
  const bg = state.background
  const owners = getTeamNames(bg)

  const header = el('div', 'app-section-header', null)
  header.appendChild(el('div', 'app-section-title', 'People'))
  const row2 = el('div', 'section-header-row2', null)
  const left = el('div', 'section-header-left', null)
  left.appendChild(inlineActionButton('Add person', () => { peopleView = 'cards'; peopleAdding = true; renderPeople() }, { id: 'btn-add-person' }))
  row2.appendChild(left)

  const actionsWrap = el('div', 'module-section-actions module-section-actions-scroll', null)
  const filterWrap = el('div', 'people-filter-wrapper', null)
  const filtersOn = peopleFilters.exec || peopleFilters.incomplete || !!peopleFilters.ownerFilter
  const filterBtn = el('button', 'module-filter-chip' + (filtersOn ? ' on' : ''), 'Filters'); filterBtn.dataset.fk = 'filters'
  filterBtn.type = 'button'
  filterBtn.addEventListener('click', () => { peopleFilterPanelOpen = !peopleFilterPanelOpen; renderPeople() })
  filterWrap.appendChild(filterBtn)
  if (peopleFilterPanelOpen) {
    const pop = el('div', 'app-popover people-filter-panel', null)
    pop.style.position = 'absolute'
    pop.addEventListener('keydown', e => { if (e.key === 'Escape') { peopleFilterPanelOpen = false; renderPeople(); const fb = document.querySelector('#people-body [data-fk="filters"]'); if (fb) fb.focus() } })
    const group = el('div', 'filter-checkbox-group', null)
    const execLbl = el('label', null, null)
    const execCb = el('input', null, null); execCb.type = 'checkbox'; execCb.dataset.fk = 'exec'; execCb.checked = peopleFilters.exec
    execCb.addEventListener('change', () => { peopleFilters.exec = execCb.checked; peoplePage = 0; renderPeople() })
    execLbl.appendChild(execCb); execLbl.appendChild(document.createTextNode(' Executive'))
    const incLbl = el('label', null, null)
    const incCb = el('input', null, null); incCb.type = 'checkbox'; incCb.dataset.fk = 'inc'; incCb.checked = peopleFilters.incomplete
    incCb.addEventListener('change', () => { peopleFilters.incomplete = incCb.checked; peoplePage = 0; renderPeople() })
    incLbl.appendChild(incCb); incLbl.appendChild(document.createTextNode(' Incomplete'))
    group.appendChild(execLbl); group.appendChild(incLbl)
    pop.appendChild(group)
    if (owners.length) {
      const rg = el('div', 'filter-radio-group filter-radio-group--top-spaced', null)
      rg.appendChild(el('div', 'filter-radio-divider', 'Organization owner'))
      const allLbl = el('label', null, null)
      const allRb = el('input', null, null); allRb.type = 'radio'; allRb.dataset.fk = 'own-all'; allRb.name = 'owner-filter'; allRb.checked = peopleFilters.ownerFilter === ''
      allRb.addEventListener('change', () => { peopleFilters.ownerFilter = ''; peoplePage = 0; renderPeople() })
      allLbl.appendChild(allRb); allLbl.appendChild(document.createTextNode(' All'))
      rg.appendChild(allLbl)
      owners.forEach(name => {
        const lbl = el('label', null, null)
        const rb = el('input', null, null); rb.type = 'radio'; rb.dataset.fk = 'own-' + name; rb.name = 'owner-filter'; rb.checked = peopleFilters.ownerFilter === name
        rb.addEventListener('change', () => { peopleFilters.ownerFilter = name; peoplePage = 0; renderPeople() })
        lbl.appendChild(rb); lbl.appendChild(document.createTextNode(' ' + name))
        rg.appendChild(lbl)
      })
      pop.appendChild(rg)
    }
    filterWrap.appendChild(pop)
  }
  actionsWrap.appendChild(filterWrap)

  actionsWrap.appendChild(singleSelectEl([['name', 'Name A–Z'], ['seniority', 'Seniority'], ['department', 'Department']], peopleSort, v => { peopleSort = v; peoplePage = 0; renderPeople() }, 'sort-select'))

  const toggle = el('div', 'app-view-toggle', null)
  const cardsBtn = el('button', 'app-view-toggle-btn' + (peopleView === 'cards' ? ' active' : ''), 'Cards')
  cardsBtn.type = 'button'; cardsBtn.dataset.fk = 'view-cards'; cardsBtn.addEventListener('click', () => { peopleView = 'cards'; renderPeople() })
  const orgBtn = el('button', 'app-view-toggle-btn' + (peopleView === 'orgchart' ? ' active' : ''), 'Org')
  orgBtn.type = 'button'; orgBtn.dataset.fk = 'view-org'; orgBtn.addEventListener('click', () => { peopleView = 'orgchart'; renderPeople() })
  toggle.appendChild(cardsBtn); toggle.appendChild(orgBtn)
  actionsWrap.appendChild(toggle)
  row2.appendChild(actionsWrap)
  header.appendChild(row2)
  root.appendChild(header)

  const body = el('div', null, null)
  body.id = 'people-body-inner'
  root.appendChild(body)

  if (peopleView === 'orgchart') {
    const orgRoot = el('div', null, null); orgRoot.id = 'people-orgchart-root'
    body.appendChild(orgRoot)
    renderOrgChart()
    return
  }

  const people = filteredPeople()
  if (!people.length && !peopleAdding) body.appendChild(emptyResultsBox(state.stakeholders.length ? 'No results' : 'No people yet. Click Add person to start.'))
  const grid = el('div', 'people-grid', null)
  if (peopleAdding) grid.appendChild(makeInlinePersonCard())
  const totalPages = Math.ceil(people.length / PEOPLE_PAGE_SIZE)
  const safePage = Math.min(peoplePage, Math.max(0, totalPages - 1))
  people.slice(safePage * PEOPLE_PAGE_SIZE, (safePage + 1) * PEOPLE_PAGE_SIZE).forEach(p => grid.appendChild(makePersonCard(p)))
  body.appendChild(grid)
  if (totalPages > 1) body.appendChild(paginationRow(safePage, totalPages, p => { peoplePage = p; renderPeople() }))
}

function paginationRow(page, total, onChange) {
  const row = el('div', 'pagination-row', null)
  function btn(label, disabled, target) {
    const b = el('button', 'btn btn--compact', label); b.type = 'button'; b.disabled = disabled; b.dataset.fk = 'pg-' + label
    b.addEventListener('click', () => onChange(target))
    return b
  }
  row.appendChild(btn('First', page === 0, 0))
  row.appendChild(btn('Previous', page === 0, page - 1))
  row.appendChild(el('span', 'pagination-label', 'Page ' + (page + 1) + ' of ' + total))
  row.appendChild(btn('Next', page === total - 1, page + 1))
  row.appendChild(btn('Last', page === total - 1, total - 1))
  return row
}

function makePersonCard(person) {
  // The side-panel card outlives renderPeople(), so current() re-reads the record before every save.
  const current = () => state.stakeholders.find(x => x.id === person.id) || person
  const card = el('div', 'person-card', null)
  card.title = 'Last updated: ' + (person.last_updated || '')
  const top = el('div', 'person-card-top', null)
  const info = el('div', 'person-card-info', null)
  info.appendChild(editable('div', 'name', person.name, '', v => { if (sanitizeName(v)) savePerson({ ...current(), name: sanitizeName(v) }); renderPeople() }, { ariaLabel: 'Name' }))
  const titleRow = el('div', 'card-meta-row', null)
  titleRow.appendChild(el('span', 'card-meta-label', 'Title:'))
  titleRow.appendChild(editable('span', '', person.title, 'Add title…', v => { savePerson({ ...current(), title: v }); renderPeople() }, { ariaLabel: 'Title' }))
  info.appendChild(titleRow)
  const deptRow = el('div', 'card-meta-row', null)
  deptRow.appendChild(el('span', 'card-meta-label', 'Dept:'))
  deptRow.appendChild(editable('span', '', person.department, 'Add department…', v => { savePerson({ ...current(), department: v }); renderPeople() }, { ariaLabel: 'Department' }))
  info.appendChild(deptRow)

  const more = el('div', 'person-more-fields', null)
  const sentimentRow = el('div', 'card-meta-row', null)
  sentimentRow.appendChild(el('span', 'card-meta-label', 'Sentiment:'))
  sentimentRow.appendChild(sentimentDot(person.sentiment))
  sentimentRow.appendChild(singleSelectEl(SENTIMENT_OPTS.map(s => [s, s]), person.sentiment || 'Unknown', v => { savePerson({ ...current(), sentiment: v }); renderPeople() }, 'card-owner-btn popover-trigger'))
  more.appendChild(sentimentRow)

  const workerTypeRow = el('div', 'card-meta-row', null)
  workerTypeRow.appendChild(el('span', 'card-meta-label', 'Type:'))
  workerTypeRow.appendChild(workerTypeDot(person.worker_type))
  workerTypeRow.appendChild(singleSelectEl(WORKER_TYPE_OPTS.map(w => [w, w]), person.worker_type || 'Client Employee', v => { savePerson({ ...current(), worker_type: v }); renderPeople() }, 'card-owner-btn popover-trigger'))
  more.appendChild(workerTypeRow)

  const execRow = el('div', 'card-meta-row', null)
  const execCb = el('input', null, null); execCb.type = 'checkbox'
  execCb.checked = isExec(person)
  const execId = 'exec-cb-' + person.id
  execCb.id = execId
  execCb.addEventListener('change', () => { savePerson({ ...current(), is_executive: execCb.checked ? 'true' : 'false' }); renderPeople() })
  execRow.appendChild(execCb)
  const execLbl = el('label', 'card-meta-label', 'Executive')
  execLbl.setAttribute('for', execId)
  execLbl.style.cursor = 'pointer'
  execRow.appendChild(execLbl)
  more.appendChild(execRow)

  top.appendChild(info); card.appendChild(top)

  const bodyWrap = el('div', 'person-card-body expanded', null)
  const ownersBlock = el('div', 'person-owners-block', null)
  ;[['primary_owner', 'Primary:'], ['secondary_owner', 'Secondary:']].forEach(([key, label]) => {
    const row = el('div', 'card-meta-row card-meta-row--spaced', null)
    row.appendChild(el('span', 'card-meta-label', label))
    row.appendChild(personSelectEl(person[key] || '', v => { savePerson({ ...current(), [key]: v }); renderPeople() }, 'card-owner-btn'))
    ownersBlock.appendChild(row)
  })
  more.appendChild(ownersBlock)

  const rtoRow = el('div', 'card-meta-row card-meta-row--spaced', null)
  rtoRow.appendChild(el('span', 'card-meta-label', 'Reports to:'))
  const others = state.stakeholders.filter(s => s.id !== person.id)
  rtoRow.appendChild(singleSelectEl([['', 'Select person…'], ...others.map(o => [o.id, o.name])], person.reports_to || '', v => {
    if (v && isDescendantOf(v, person.id, state.stakeholders)) { showToast('Cannot create circular reporting relationship'); renderPeople(); return }
    savePerson({ ...current(), reports_to: v }); renderPeople()
  }, 'card-owner-btn popover-trigger'))
  bodyWrap.appendChild(rtoRow)

  const engRow = el('div', 'card-meta-row card-meta-row--spaced', null)
  engRow.appendChild(el('span', 'card-meta-label', 'Engagement:'))
  engRow.appendChild(editable('span', 'picker-btn-inline', person.engagement, 'Account-wide', v => { savePerson({ ...current(), engagement: v }); renderPeople() }, { ariaLabel: 'Engagement' }))
  more.appendChild(engRow)
  card.appendChild(bodyWrap)

  const moreOpen = peopleMoreOpen.has(person.id)
  const moreToggle = el('button', 'person-more-toggle', (moreOpen ? 'Fewer fields' : 'More fields') + (!moreOpen && hasExtraPersonFields(person) ? ' •' : ''))
  moreToggle.type = 'button'
  moreToggle.setAttribute('aria-expanded', moreOpen ? 'true' : 'false')
  moreToggle.addEventListener('click', () => { if (moreOpen) peopleMoreOpen.delete(person.id); else peopleMoreOpen.add(person.id); renderPeople(); refreshPersonPanel(person.id) })
  card.appendChild(moreToggle)
  if (moreOpen) card.appendChild(more)

  const notesLabel = el('div', 'card-section-label card-section-label--link card-section-label--reset', 'Notes' + (person.notes ? ' •' : ''))
  let notesOpen = false
  const notesSlot = el('div', null, null)
  const openNotes = () => { notesOpen = true; renderNotesSlot() }
  notesLabel.addEventListener('click', openNotes)
  makeActivatable(notesLabel, 'Notes', openNotes); notesLabel.setAttribute('role', 'button')
  function renderNotesSlot() {
    notesSlot.innerHTML = ''
    if (!notesOpen) return
    const pop = el('div', 'app-popover card-notes-popup', null)
    pop.appendChild(editable('div', 'card-body-text', person.notes, 'Add notes about this person', v => { savePerson({ ...current(), notes: v }); renderPeople() }, { multiline: true, ariaLabel: 'Notes' }))
    notesSlot.appendChild(pop)
  }
  card.appendChild(notesLabel); card.appendChild(notesSlot)

  card.appendChild(compactRemoveButton('Delete person', () => confirmDeletePerson(person)))
  return card
}

function makeInlinePersonCard() {
  const rec = newPerson()
  const card = el('div', 'person-card new-card', null)
  let discarded = false
  card.appendChild(compactRemoveButton('Discard', () => { discarded = true; peopleAdding = false; renderPeople() }))
  const top = el('div', 'person-card-top', null)
  const info = el('div', 'person-card-info', null)
  const nameEl = editable('div', 'name field-required-highlight inline-title-text', '', 'Full name…', v => {
    if (discarded) return
    rec.name = v
    if (v) { state.stakeholders.push(rec); peopleAdding = false; persist(); renderPeople() }
    else if (card.isConnected && !newCardInUse(card)) { peopleAdding = false; renderPeople() }
  }, { ariaLabel: 'Name', alwaysSave: true })
  info.appendChild(nameEl)
  top.appendChild(info); card.appendChild(top)
  setTimeout(() => nameEl.focus(), 0)
  return card
}

// ---- Person detail side panel ----
// The side panel holds its own copy of the card, so More fields rebuilds it.
function refreshPersonPanel(id) {
  const content = document.querySelector('#org-person-panel .person-detail-content')
  const p = personById(id)
  if (content && p) { content.innerHTML = ''; content.appendChild(makePersonCard(p)) }
}

let personPanelOnKey = null
function openPersonDetail(person) {
  const existing = document.getElementById('org-person-panel')
  if (existing) existing.remove()
  if (personPanelOnKey) document.removeEventListener('keydown', personPanelOnKey)
  const panel = el('div', 'person-detail-panel', null)
  panel.id = 'org-person-panel'
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'org-person-title'); panel.dataset.personId = person.id
  const header = el('div', 'person-detail-header', null)
  const titleEl = el('span', 'person-detail-title', person.name || 'Person'); titleEl.id = 'org-person-title'
  header.appendChild(titleEl)
  const closeBtn = el('button', 'app-modal-close person-detail-close', '×')
  closeBtn.type = 'button'; closeBtn.setAttribute('aria-label', 'Close panel')
  const closePanel = () => { panel.remove(); document.removeEventListener('keydown', onKey) }
  closeBtn.addEventListener('click', closePanel)
  header.appendChild(closeBtn)
  panel.appendChild(header)
  const content = el('div', 'person-detail-content', null)
  content.appendChild(makePersonCard(person))
  panel.appendChild(content)
  document.body.appendChild(panel)
  closeBtn.focus()
  const onKey = e => { if (e.key === 'Escape') closePanel() }
  personPanelOnKey = onKey
  document.addEventListener('keydown', onKey)
}
