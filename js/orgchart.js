'use strict';
// Org chart: drag-and-drop and click-to-move reporting lines, a loop guard, SVG connectors
// and a department-grouped unassigned zone.

function buildOrgModel(people) {
  const ids = {}; people.forEach(p => { ids[p.id] = true })
  const childMap = {}
  people.forEach(p => { if (p.reports_to && ids[p.reports_to]) { (childMap[p.reports_to] = childMap[p.reports_to] || []).push(p.id) } })
  // A root manages someone and reports to no one on the chart.
  const roots = people.filter(p => childMap[p.id] && !(p.reports_to && ids[p.reports_to]))
  // People in a reporting loop (A reports to B and B to A) have a boss but no route to a root,
  // so they would vanish from the chart. Anyone the roots cannot reach goes to the unassigned zone.
  const reachable = {}
  const walk = id => { if (reachable[id]) return; reachable[id] = true; (childMap[id] || []).forEach(walk) }
  roots.forEach(r => walk(r.id))
  const unassigned = people.filter(p => !reachable[p.id])
  const deptGrouped = {}, unlabeled = []
  unassigned.forEach(p => { if (p.department) (deptGrouped[p.department] = deptGrouped[p.department] || []).push(p); else unlabeled.push(p) })
  return { childMap, roots, unassigned, deptGrouped, unlabeled }
}

let orgDraggedId = null
let orgPickedId = null

function personById(id) { return state.stakeholders.find(p => p.id === id) }

function orgSetReportsTo(personId, managerId) {
  const p = personById(personId)
  if (!p) return
  p.reports_to = managerId
  p.last_updated = today()
  persist()
  renderOrgChart(personId)
  showToast((p.name || 'Person') + ' now reports to ' + ((personById(managerId) || {}).name || ''))
}

function orgDeleteFromTreeOnly(personId) {
  const p = personById(personId)
  if (!p || !p.reports_to) return
  p.reports_to = ''; p.last_updated = today()
  persist(); renderOrgChart()
}

function orgMakeCard(person, isUnassigned, onOpenDetail, staticMode) {
  const workerModifier = person.worker_type === 'Internal Staff' ? ' org-node-card--internal' : person.worker_type === 'Contractor' ? ' org-node-card--contractor' : ''
  const card = el('div', 'org-node-card' + workerModifier, null)
  if (workerModifier) card.title = person.worker_type // the outline color alone means nothing to a reader who wasn't told the convention -- on a static export, nobody's here to ask
  card.dataset.id = person.id
  if (!staticMode) { card.draggable = true; card.setAttribute('role', 'group'); card.setAttribute('aria-label', person.name || 'Person'); card.tabIndex = 0 }

  const headerRow = el('div', 'org-node-header-row', null)
  headerRow.appendChild(el('div', 'org-node-name', person.name || ''))
  card.appendChild(headerRow)
  const metaParts = [person.title, person.department].filter(Boolean).join(', ')
  if (metaParts) card.appendChild(el('div', 'org-node-meta', metaParts))
  const ownerParts = []
  if (person.primary_owner) ownerParts.push('P: ' + person.primary_owner)
  if (person.secondary_owner) ownerParts.push('S: ' + person.secondary_owner)
  if (ownerParts.length) card.appendChild(el('div', 'org-node-meta org-node-owners', ownerParts.join(' · ')))

  if (staticMode) return card
  if (isUnassigned) {
    card.appendChild(compactRemoveButton('Delete person', () => confirmDeletePerson(person), 'org-unlink-btn'))
  } else if (person.reports_to) {
    card.appendChild(compactRemoveButton('Remove from reporting structure', () => orgDeleteFromTreeOnly(person.id), 'org-unlink-btn'))
  }

  card.addEventListener('dragstart', e => {
    orgDraggedId = person.id
    card.classList.add('dragging')
    e.dataTransfer.setData('text/plain', person.id)
    e.dataTransfer.effectAllowed = 'move'
  })
  card.addEventListener('dragend', () => {
    orgDraggedId = null
    card.classList.remove('dragging')
    document.querySelectorAll('.org-node-card').forEach(c => c.classList.remove('drop-target'))
  })
  if (!isUnassigned) {
    card.addEventListener('dragover', e => {
      e.preventDefault()
      const dragId = orgDraggedId
      if (!dragId || dragId === person.id) return
      if (isDescendantOf(person.id, dragId, state.stakeholders)) { e.dataTransfer.dropEffect = 'none'; return }
      card.classList.add('drop-target')
      e.dataTransfer.dropEffect = 'move'
    })
    card.addEventListener('dragleave', () => card.classList.remove('drop-target'))
    card.addEventListener('drop', e => {
      e.preventDefault()
      card.classList.remove('drop-target')
      const dragId = e.dataTransfer.getData('text/plain') || orgDraggedId
      orgDraggedId = null
      if (!dragId || dragId === person.id) return
      if (isDescendantOf(person.id, dragId, state.stakeholders)) { showToast('Cannot create circular reporting relationship'); return }
      orgSetReportsTo(dragId, person.id)
    })
  }

  card.addEventListener('click', e => {
    if (e.target.closest('button')) return
    if (orgPickedId && orgPickedId !== person.id && !isUnassigned) {
      const moved = orgPickedId; orgPickedId = null // cleared first, so the one render below drops the picked outline
      if (isDescendantOf(person.id, moved, state.stakeholders)) { showToast('Cannot create circular reporting relationship'); renderOrgChart(moved) }
      else orgSetReportsTo(moved, person.id)
      return
    }
    onOpenDetail(person)
  })
  card.addEventListener('keydown', e => {
    if (e.target !== card) return
    if (e.key === 'Enter') { e.preventDefault(); card.click(); return }
    if (e.key === ' ') {
      e.preventDefault()
      orgPickedId = orgPickedId === person.id ? null : person.id
      renderOrgChart(person.id)
    }
    if (e.key === 'Escape') { orgPickedId = null; renderOrgChart(person.id) }
  })
  if (orgPickedId === person.id) card.classList.add('picked')
  return card
}

function orgRenderBranch(id, childMap, onOpenDetail, staticMode) {
  const branch = el('div', 'org-branch', null)
  branch.appendChild(orgMakeCard(personById(id), false, onOpenDetail, staticMode))
  const kids = childMap[id] || []
  if (kids.length) {
    const row = el('div', 'org-children', null)
    kids.forEach(cid => row.appendChild(orgRenderBranch(cid, childMap, onOpenDetail, staticMode)))
    branch.appendChild(row)
  }
  return branch
}

function drawOrgLines(outer, tree) {
  outer.querySelectorAll('.org-lines').forEach(s => s.remove())
  const outerRect = outer.getBoundingClientRect()
  const parents = []
  tree.querySelectorAll('.org-branch > .org-children').forEach(row => {
    const pb = row.parentElement
    if (pb && pb.classList.contains('org-branch')) parents.push(pb)
  })
  if (!parents.length) return
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'org-lines')
  svg.style.width = outer.scrollWidth + 'px'; svg.style.height = outer.scrollHeight + 'px'
  const scrollX = outer.scrollLeft, scrollY = outer.scrollTop
  function path(d) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    p.setAttribute('d', d); p.setAttribute('stroke', 'var(--color-border)'); p.setAttribute('stroke-width', '2')
    p.setAttribute('fill', 'none'); p.setAttribute('stroke-linecap', 'round')
    svg.appendChild(p)
  }
  parents.forEach(pb => {
    const parentCard = pb.querySelector(':scope > .org-node-card')
    const childrenRow = pb.querySelector(':scope > .org-children')
    if (!parentCard || !childrenRow) return
    const pRect = parentCard.getBoundingClientRect()
    const pX = pRect.left - outerRect.left + scrollX + pRect.width / 2
    const pY = pRect.top - outerRect.top + scrollY + pRect.height
    const childCards = [...childrenRow.querySelectorAll(':scope > .org-branch > .org-node-card')]
    if (!childCards.length) return
    const childRects = childCards.map(c => c.getBoundingClientRect())
    const midY = pY + (childRects[0].top - outerRect.top + scrollY - pY) / 2
    childRects.forEach(cRect => {
      const cX = cRect.left - outerRect.left + scrollX + cRect.width / 2
      const cY = cRect.top - outerRect.top + scrollY
      path('M ' + pX + ' ' + pY + ' L ' + pX + ' ' + midY + ' L ' + cX + ' ' + midY + ' L ' + cX + ' ' + cY)
    })
  })
  outer.appendChild(svg)
}

let orgZoom = 1.0

// The chart as a node tree. The editable version carries zoom and drag zones and follows the People
// filters; the static one is what the downloaded page serializes, with everyone.
function buildOrgChartOuter(staticMode) {
  const model = buildOrgModel(staticMode ? state.stakeholders : filteredPeople())
  const open = staticMode ? () => {} : openPersonDetail
  const outer = el('div', 'org-chart-outer', null)
  if (!staticMode) {
    const zoomCtl = el('div', 'org-zoom-controls', null)
    const outBtn = el('button', null, 'Zoom out'); outBtn.type = 'button'
    const resetBtn = el('button', null, 'Reset'); resetBtn.type = 'button'
    const inBtn = el('button', null, 'Zoom in'); inBtn.type = 'button'
    const zoomTo = z => { orgZoom = z; tree.style.transform = 'scale(' + z + ')'; drawOrgLines(outer, tree) }
    outBtn.addEventListener('click', () => zoomTo(Math.max(0.4, +(orgZoom - 0.1).toFixed(1))))
    resetBtn.addEventListener('click', () => zoomTo(1.0))
    inBtn.addEventListener('click', () => zoomTo(Math.min(1.5, +(orgZoom + 0.1).toFixed(1))))
    zoomCtl.appendChild(outBtn); zoomCtl.appendChild(resetBtn); zoomCtl.appendChild(inBtn)
    outer.appendChild(zoomCtl)
  }
  outer.appendChild(el('div', 'overview-stat-label org-section-title', 'Reporting structure'))
  if (!staticMode) outer.appendChild(el('div', 'fontXs textSecondary', 'To move a card with the keyboard, press Space on it, then Enter on the manager.'))

  const tree = el('div', 'org-tree org-tree-layout', null)
  if (!staticMode) tree.style.transform = 'scale(' + orgZoom + ')'
  if (!model.roots.length) {
    tree.appendChild(el('div', 'org-empty-hint', staticMode ? 'No reporting structure yet.' : state.stakeholders.length ? 'Drag people from below to build the reporting structure.' : 'No people yet. Add one from the Cards view.'))
  } else {
    model.roots.forEach(p => tree.appendChild(orgRenderBranch(p.id, model.childMap, open, staticMode)))
  }
  outer.appendChild(tree)

  if (model.unassigned.length) {
    const zone = el('div', 'org-zone2-drop', null)
    zone.appendChild(el('div', 'overview-stat-label org-section-title', staticMode ? 'Not yet placed' : 'Not yet placed: drag a card onto the chart to assign who they report to'))
    Object.entries(model.deptGrouped).forEach(([dept, people]) => {
      zone.appendChild(el('div', 'org-dept-label', dept))
      const nodesWrap = el('div', 'org-unmapped-nodes', null)
      people.forEach(p => nodesWrap.appendChild(orgMakeCard(p, true, open, staticMode)))
      zone.appendChild(nodesWrap)
    })
    if (model.unlabeled.length) {
      const nodesWrap = el('div', 'org-unmapped-nodes', null)
      model.unlabeled.forEach(p => nodesWrap.appendChild(orgMakeCard(p, true, open, staticMode)))
      zone.appendChild(nodesWrap)
    }
    if (!staticMode) {
        zone.addEventListener('dragover', e => { if (e.target.closest('.org-node-card')) return; e.preventDefault(); zone.classList.add('is-hover'); e.dataTransfer.dropEffect = 'move' })
      zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('is-hover') })
      zone.addEventListener('drop', e => {
        if (e.target.closest('.org-node-card')) return
        e.preventDefault(); zone.classList.remove('is-hover')
        const dragId = e.dataTransfer.getData('text/plain') || orgDraggedId
        orgDraggedId = null
        if (dragId) orgDeleteFromTreeOnly(dragId)
      })
    }
    outer.appendChild(zone)
  }

  return { outer, tree }
}

function renderOrgChart(focusId) {
  const root = document.getElementById('people-orgchart-root')
  if (!root) return
  root.innerHTML = ''
  const { outer, tree } = buildOrgChartOuter(false)
  root.appendChild(outer)
  requestAnimationFrame(() => drawOrgLines(outer, tree))
  if (focusId) { const c = [...root.querySelectorAll('.org-node-card')].find(x => x.dataset.id === focusId); if (c) c.focus() }
}
