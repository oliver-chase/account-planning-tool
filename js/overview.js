'use strict';
// Plan page: account team, meeting cadence, next meeting, revenue chart and account notes.

const FREQ_OPTS = [['', 'Does not repeat'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly']]
const DAY_LABELS = [['Sun', 'S'], ['Mon', 'M'], ['Tue', 'T'], ['Wed', 'W'], ['Thu', 'T'], ['Fri', 'F'], ['Sat', 'S']]
const DAY_FULL = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' }

function getSummaryText(bg) {
  const freq = bg.meeting_frequency || ''
  const n = parseInt(bg.meeting_interval || '1') || 1
  const day = bg.meeting_day || ''
  if (!freq) return ''
  const fullDay = day ? (DAY_FULL[day] || day) : ''
  if (freq === 'weekly') return n === 1 ? (fullDay ? 'Every ' + fullDay : 'Weekly') : 'Every ' + n + ' weeks' + (fullDay ? ' on ' + fullDay : '')
  if (freq === 'monthly') return n === 1 ? 'Monthly' : 'Every ' + n + ' months'
  if (freq === 'quarterly') return n === 1 ? 'Quarterly' : 'Every ' + n + ' quarters'
  return ''
}

// The next meeting is the cadence stepped forward from the last logged call, never earlier
// than today, so an old last note still projects a future date.
function computeNextMeeting(bg, notes, nowISO) {
  const freq = bg.meeting_frequency || ''
  if (!freq) return null
  const now = nowISO || today()
  const n = Math.max(1, parseInt(bg.meeting_interval || '1') || 1)
  const sorted = notes.filter(x => x.date).sort((a, b) => b.date.localeCompare(a.date))
  // No meeting note logged yet (a brand-new account) -- anchor off today.
  const anchor = (sorted.length ? sorted[0].date : null) || now
  if (freq === 'weekly') {
    const step = 7 * n
    const targetDay = Object.keys(DAY_FULL).indexOf(bg.meeting_day || '')
    // With a meeting day: the first such day after the last call, plus (interval - 1) weeks.
    let next = targetDay >= 0
      ? isoPlusDays(isoPlusDays(anchor, 1), (targetDay - new Date(isoPlusDays(anchor, 1) + 'T00:00:00').getDay() + 7) % 7 + 7 * (n - 1))
      : isoPlusDays(anchor, step)
    while (next < now) next = isoPlusDays(next, step)
    return next
  }
  if (freq === 'monthly' || freq === 'quarterly') {
    const step = freq === 'monthly' ? n : 3 * n
    let k = 1, next = isoPlusMonths(anchor, step)
    while (next < now) next = isoPlusMonths(anchor, step * ++k)
    return next
  }
  return null
}

// Survives re-renders: saveBg() re-runs renderOverview() after every edit, and the panel stays open across them.
let overviewCadenceOpen = null

// Hook excel.js's importWorkbook() calls after loading a different account's data, so this
// panel's open/closed state doesn't carry over from whatever account was open before.
function resetOverviewCadenceUI() { overviewCadenceOpen = null }

// Patches one year's revenue from the stored record, so an edit from an older render never undoes another.
function revenuePatch(year, fields) { const rev = state.background.revenue || {}; return { revenue: { ...rev, [year]: { ...(rev[year] || {}), ...fields } } } }

function saveBg(patch) {
  state.background = { ...state.background, ...patch, last_updated: today() }
  persist(); renderOverview()
}

function renderOverview() { renderKeepingFocus('overview-body', renderOverviewBody) }

function renderOverviewBody() {
  const root = document.getElementById('overview-body')
  root.innerHTML = ''
  const b = state.background
  const teamNames = getTeamNames(b)
  const curYear = new Date().getFullYear(), prevYear = curYear - 1
  const attendees = toArray(b.meeting_attendees)
  const teamMembers = toArray(b.account_team)
  const override = b.next_meeting_override && b.next_meeting_override >= today() ? b.next_meeting_override : null
  const computed = !override ? computeNextMeeting(b, state.notes) : null
  const lastNote = state.notes.filter(n => n.date).sort((a, c) => c.date.localeCompare(a.date))[0]

  renderPlanHeader(root)

  const row1 = el('div', 'overview-row overview-row-gap-bottom', null)

  // Card 1: director / manager / team
  const card1 = el('div', 'app-card overview-card-col', null)
  card1.appendChild(el('div', 'app-card-label', 'Account director'))
  card1.appendChild(personSelectEl(b.account_director || '', v => saveBg({ account_director: v }), 'card-owner-btn'))
  card1.appendChild(el('div', 'app-card-label overview-label-top', 'Account manager'))
  card1.appendChild(personSelectEl(b.account_manager || '', v => saveBg({ account_manager: v }), 'card-owner-btn'))
  card1.appendChild(el('div', 'app-card-label overview-label-top', 'Account team'))
  card1.appendChild(multiPicker(teamNames, teamMembers, next => saveBg({ account_team: next.join('; ') }), 'Add person'))
  const rosterLink = el('button', 'card-action-link', 'Manage roster')
  rosterLink.type = 'button'
  rosterLink.addEventListener('click', () => openRosterModal(state.background, name => saveBg(removeTeamMember(state.background, name))))
  card1.appendChild(rosterLink)
  row1.appendChild(card1)

  // Card 2: meeting cadence
  const card2 = el('div', 'app-card overview-card-col overview-meeting-card', null)
  card2.appendChild(el('div', 'overview-stat-label', 'Meeting cadence'))
  const summaryRow = el('div', 'overview-cadence-summary-row', null)
  summaryRow.appendChild(el('span', 'overview-cadence-summary-text' + (b.meeting_frequency ? '' : ' overview-cadence-summary-text-empty'), b.meeting_frequency ? getSummaryText(b) : 'Not set'))
  if (overviewCadenceOpen === null) overviewCadenceOpen = !b.meeting_frequency
  const panel = el('div', 'overview-cadence-panel', null)
  function renderCadencePanel() {
    panel.innerHTML = ''
    panel.style.display = overviewCadenceOpen ? '' : 'none'
    panel.appendChild(singleSelectEl(FREQ_OPTS, b.meeting_frequency || '', v => saveBg({ meeting_frequency: v, meeting_day: v === 'weekly' ? b.meeting_day : '' }), 'card-owner-btn popover-trigger'))
    if (b.meeting_frequency) {
      const everyRow = el('div', 'overview-cadence-every-row', null)
      everyRow.appendChild(el('span', 'overview-cadence-inline-text', 'Every'))
      const intInput = el('input', 'overview-interval-input', null)
      intInput.type = 'number'; intInput.setAttribute('aria-label', 'Meeting interval'); intInput.min = 1; intInput.value = b.meeting_interval || '1'
      // The save waits a moment so a click on the next control lands before the section rebuilds. Update Excel
      // and closing the page run a waiting save first. Enter saves at once and keeps focus in the box.
      let intTimer = null, intRun = null
      const commitInterval = () => saveBg({ meeting_interval: String(Math.max(1, parseInt(intInput.value || '1') || 1)) })
      intInput.addEventListener('blur', () => {
        clearTimeout(intTimer); pendingEditSaves.delete(intRun)
        intRun = () => { clearTimeout(intTimer); pendingEditSaves.delete(intRun); commitInterval() }
        pendingEditSaves.add(intRun)
        intTimer = setTimeout(intRun, 250)
      })
      intInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commitInterval() } })
      everyRow.appendChild(intInput)
      everyRow.appendChild(el('span', 'overview-cadence-inline-text', b.meeting_frequency === 'weekly' ? 'week(s)' : b.meeting_frequency === 'monthly' ? 'month(s)' : 'quarter(s)'))
      panel.appendChild(everyRow)
    }
    if (b.meeting_frequency === 'weekly') {
      const chipRow = el('div', 'overview-chip-row overview-chip-row-top', null)
      chipRow.appendChild(el('span', 'overview-cadence-on-label', 'On'))
      DAY_LABELS.forEach(([val, label]) => {
        const btn = el('button', 'overview-day-btn' + (b.meeting_day === val ? ' is-selected' : ''), label)
        btn.type = 'button'; btn.title = val; btn.dataset.fk = 'day-' + val; btn.setAttribute('aria-label', DAY_FULL[val]); btn.setAttribute('aria-pressed', b.meeting_day === val ? 'true' : 'false')
        btn.addEventListener('click', () => saveBg({ meeting_day: val }))
        chipRow.appendChild(btn)
      })
      panel.appendChild(chipRow)
    }
  }
  renderCadencePanel()
  const toggleCadence = () => { overviewCadenceOpen = !overviewCadenceOpen; summaryRow.setAttribute('aria-expanded', overviewCadenceOpen ? 'true' : 'false'); renderCadencePanel() }
  summaryRow.addEventListener('click', toggleCadence)
  makeActivatable(summaryRow, 'Meeting cadence', toggleCadence)
  summaryRow.setAttribute('role', 'button'); summaryRow.setAttribute('aria-expanded', overviewCadenceOpen ? 'true' : 'false')
  card2.appendChild(summaryRow)
  card2.appendChild(panel)

  const mtWrap = el('div', null, null)
  mtWrap.appendChild(el('div', 'overview-field-label', 'Meeting title'))
  mtWrap.appendChild(editable('div', 'overview-stat-val', b.meeting_title, 'e.g. Quarterly account review', v => saveBg({ meeting_title: v }), { ariaLabel: 'Meeting title' }))
  card2.appendChild(mtWrap)

  const attWrap = el('div', null, null)
  attWrap.appendChild(el('div', 'overview-field-label', 'Recurring attendees'))
  attWrap.appendChild(multiPicker(allKnownNames(b), attendees, next => saveBg({ meeting_attendees: next.join('; ') }), 'Add attendee'))
  card2.appendChild(attWrap)
  row1.appendChild(card2)
  root.appendChild(row1)

  // Stats row
  const stats = el('div', 'overview-stats', null)

  const s1 = el('div', 'overview-stat', null)
  s1.title = 'Next scheduled or projected meeting date based on cadence.'
  s1.appendChild(el('div', 'overview-stat-label', 'Next meeting'))
  if (override) {
    s1.appendChild(el('div', 'overview-stat-date', fmtDate(override)))
    const sub = el('div', 'overview-stat-sublabel', 'Override ')
    const clearBtn = el('button', 'overview-clear-btn', 'Clear')
    clearBtn.type = 'button'; clearBtn.addEventListener('click', () => saveBg({ next_meeting_override: '' }))
    sub.appendChild(clearBtn); s1.appendChild(sub)
  } else if (computed) {
    s1.appendChild(el('div', 'overview-stat-date', fmtDate(computed)))
    s1.appendChild(el('div', 'overview-stat-sublabel', 'Projected'))
  } else {
    s1.appendChild(el('div', 'overview-empty-italic', 'Not scheduled'))
  }
  const dateCtl = el('div', 'overview-date-controls', null)
  const dateInput = el('input', 'overview-date-input', null); dateInput.type = 'date'; dateInput.setAttribute('aria-label', 'Next meeting date'); dateInput.style.display = 'none'
  const setDateBtn = inlineActionButton('Set date', () => { dateInput.style.display = ''; dateInput.focus() })
  dateInput.addEventListener('change', () => { if (!dateInput.value) return; if (dateInput.value < today()) { showToast('Pick today or a later date.'); return } saveBg({ next_meeting_override: dateInput.value }) })
  dateCtl.appendChild(setDateBtn); dateCtl.appendChild(dateInput)
  s1.appendChild(dateCtl)
  stats.appendChild(s1)

  const s2 = el('div', 'overview-stat', null)
  s2.title = 'Date of the most recent note added for this account.'
  s2.appendChild(el('div', 'overview-stat-label', 'Last activity'))
  s2.appendChild(el('div', 'overview-stat-date' + (lastNote ? '' : ' overview-stat-date-empty'), lastNote ? fmtDate(lastNote.date) : 'No activity'))
  stats.appendChild(s2)

  // The three revenue tiles share one shape: a label, a hint, and one revenue figure that saves back into the year.
  const revenueStat = (title, label, year, field, placeholder, ariaLabel) => {
    const s = el('div', 'overview-stat', null)
    s.title = title
    s.appendChild(el('div', 'overview-stat-label', label))
    s.appendChild(editable('div', 'overview-stat-val', (b.revenue[year] || {})[field] || '', placeholder, v => saveBg(revenuePatch(year, { [field]: v })), { ariaLabel }))
    stats.appendChild(s)
  }
  revenueStat('Expected revenue from this account in the current year.', 'Current year projected revenue', curYear, 'projected', 'e.g. $450K', 'Projected revenue this year')
  revenueStat('Total revenue closed with this account in the prior year.', 'Prior year closed revenue', prevYear, 'closed', 'e.g. $380K', 'Closed revenue last year')
  revenueStat('Revenue closed with this account so far in the current year.', 'Current year closed revenue', curYear, 'closed', 'e.g. $120K', 'Closed revenue this year')
  root.appendChild(stats)

  // Revenue chart + notes row
  const row2 = el('div', 'overview-row overview-row-gap-top', null)
  const chartCard = el('div', 'overview-chart-card', null)
  chartCard.appendChild(el('div', 'app-card-label overview-label-bottom', 'Revenue history'))
  const legendRow = el('div', 'overview-legend-row', null)
  legendRow.appendChild(revLegend('projected', 'Projected'))
  legendRow.appendChild(revLegend('closed', 'Closed'))
  chartCard.appendChild(legendRow)
  const canvas = el('div', 'overview-chart-canvas', null)
  chartCard.appendChild(canvas)
  let histOpen = false
  const histBtn = inlineActionButton('Add historical year', () => { histOpen = !histOpen; renderHistForm() }, { id: 'btn-add-hist-year' })
  histBtn.classList.add('overview-link-btn-top')
  chartCard.appendChild(histBtn)
  const histSlot = el('div', null, null)
  chartCard.appendChild(histSlot)
  function renderHistForm() {
    histSlot.innerHTML = ''
    if (!histOpen) return
    histSlot.appendChild(historicalYearForm(b, (year, proj, closed) => {
      saveBg(revenuePatch(year, { projected: proj, closed }))
      histOpen = false; renderHistForm() // saving re-renders the page, so the rebuilt button takes focus
      requestAnimationFrame(() => document.getElementById('btn-add-hist-year')?.focus())
    }, () => { histOpen = false; renderHistForm(); histBtn.focus() }))
  }
  renderHistForm()
  row2.appendChild(chartCard)
  requestAnimationFrame(() => renderRevenueChart(b, canvas, updated => saveBg(updated)))

  const notesCard = el('div', 'app-card overview-card-col', null)
  notesCard.appendChild(el('div', 'app-card-label', 'Account notes'))
  notesCard.appendChild(editable('div', 'overview-notes-text', b.strategic_context, 'Add account notes', v => saveBg({ strategic_context: v }), { multiline: true, ariaLabel: 'Account notes' }))
  row2.appendChild(notesCard)
  root.appendChild(row2)
}

function revLegend(kind, label) {
  const span = el('span', 'overview-rev-legend', null)
  const swatch = el('span', 'overview-rev-legend-swatch swatch-' + kind, null)
  span.appendChild(swatch); span.appendChild(document.createTextNode(label))
  return span
}

function historicalYearForm(bg, onSave, onCancel) {
  const curYear = new Date().getFullYear()
  const wrap = el('div', 'overview-hist-form', null)
  const row = el('div', 'overview-hist-form-row', null)
  const years = []
  const earliest = Math.min(curYear - 10, ...Object.keys(bg.revenue || {}).filter(k => /^\d{4}$/.test(k)).map(Number))
  for (let y = curYear - 1; y >= earliest; y--) years.push(String(y))
  // singleSelectEl's trigger is a button with no native value or change event, so the selection lives
  // in this variable and the popover's onChange updates it.
  let selectedYear = String(curYear - 1)
  const projInput = el('input', 'overview-hist-input', null); projInput.type = 'text'; projInput.placeholder = 'Projected (e.g. $450K)'
  const closedInput = el('input', 'overview-hist-input', null); closedInput.type = 'text'; closedInput.placeholder = 'Closed (e.g. $380K)'
  const yearSelSlot = el('span', null, null)
  function renderYearSel() {
    yearSelSlot.innerHTML = ''
    yearSelSlot.appendChild(singleSelectEl(years.map(y => [y, y]), selectedYear, v => {
      selectedYear = v
      const existing = bg.revenue[selectedYear] || {}
      projInput.value = existing.projected || ''; closedInput.value = existing.closed || ''
      renderYearSel()
    }, 'card-owner-btn popover-trigger'))
  }
  const first = bg.revenue[selectedYear] || {}
  projInput.value = first.projected || ''; closedInput.value = first.closed || ''
  renderYearSel()
  const saveBtn = el('button', 'btn btn-primary btn--compact overview-hist-btn', 'Save')
  saveBtn.type = 'button'
  saveBtn.addEventListener('click', () => onSave(Number(selectedYear), projInput.value.trim(), closedInput.value.trim()))
  const cancelBtn = el('button', 'btn btn-ghost btn--compact overview-hist-btn', 'Cancel')
  cancelBtn.type = 'button'
  cancelBtn.addEventListener('click', onCancel)
  row.appendChild(yearSelSlot); row.appendChild(projInput); row.appendChild(closedInput); row.appendChild(saveBtn); row.appendChild(cancelBtn)
  wrap.appendChild(row)
  return wrap
}

// Revenue chart: projected and closed bars per year, edited by clicking a bar.
function renderRevenueChart(bg, container, onSave) {
  while (container.firstChild) container.removeChild(container.firstChild)
  container.style.maxWidth = '640px'
  const curYear = new Date().getFullYear()
  const dataYears = new Set()
  // Only plain years chart. A key like FY24 stays in the file but cannot be placed on a year axis.
  Object.entries(bg.revenue || {}).forEach(([y, d]) => { if (d && (d.projected || d.closed) && /^\d{4}$/.test(y)) dataYears.add(Number(y)) })
  dataYears.add(curYear)
  const minYear = Math.min(...dataYears)
  const years = []
  for (let y = minYear; y <= curYear; y++) years.push(y)
  let hasData = false
  years.forEach(y => {
    const r = bg.revenue[y] || {}
    const p = parseMoney(r.projected)
    const c = parseMoney(r.closed)
    if (p || c) hasData = true
  })
  container.setAttribute('role', 'img')
  container.setAttribute('aria-label', 'Revenue by year. ' + years.map(y => { const r = bg.revenue[y] || {}; return y + ': projected ' + (r.projected || 'none') + ', closed ' + (r.closed || 'none') }).join('. '))
  const W = container.clientWidth || 600
  const NS = 'http://www.w3.org/2000/svg'
  if (!hasData) {
    const H = 90, ML = 8, colW = Math.floor((W - ML) / Math.max(years.length, 1))
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('width', String(W)); svg.setAttribute('height', String(H))
    svg.style.cssText = 'display:block;width:100%;height:' + H + 'px;'
    years.forEach((y, i) => {
      const xMid = ML + i * colW + colW / 2
      const xt = document.createElementNS(NS, 'text')
      xt.setAttribute('x', String(xMid)); xt.setAttribute('y', String(H - 8)); xt.setAttribute('text-anchor', 'middle'); xt.setAttribute('font-size', '10'); xt.setAttribute('fill', 'var(--color-text-secondary)'); xt.textContent = String(y)
      svg.appendChild(xt)
    })
    const msg = document.createElementNS(NS, 'text')
    msg.setAttribute('x', String(W / 2)); msg.setAttribute('y', String((H - 28) / 2 + 10)); msg.setAttribute('text-anchor', 'middle'); msg.setAttribute('font-size', '11'); msg.setAttribute('fill', 'var(--color-text-secondary)'); msg.setAttribute('font-style', 'italic')
    msg.textContent = 'No revenue yet. Use Add historical year to enter it.'
    svg.appendChild(msg)
    container.appendChild(svg); return
  }
  const H = 110, BP = 22, ML = 44
  // Each year takes two bars plus 16 px of gap and padding, so the bars always fit the card's width.
  const barW = Math.max(2, Math.min(32, Math.floor((W - ML - years.length * 16) / (years.length * 2))))
  const gap = 4, colW = barW * 2 + gap + 12
  const chartW = Math.max(W, ML + years.length * colW)
  let maxVal = 0
  years.forEach(y => {
    const r = bg.revenue[y] || {}
    const p = parseMoney(r.projected)
    const c = parseMoney(r.closed)
    if (p > maxVal) maxVal = p; if (c > maxVal) maxVal = c
  })
  if (maxVal === 0) maxVal = 100000
  const chartH = H - BP
  const yScale = v => chartH - Math.round((v / maxVal) * chartH)
  const axisLabel = v => v >= 1000000 ? '$' + (v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1) + 'M' : v >= 1000 ? '$' + (v / 1000).toFixed(0) + 'k' : '$' + Math.round(v)
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('width', String(chartW)); svg.setAttribute('height', String(H))
  svg.style.cssText = 'display:block;width:100%;height:' + H + 'px;overflow:visible'
  const ticks = 4
  for (let i = 0; i <= ticks; i++) {
    const v = (maxVal / ticks) * i, y = yScale(v) + 10
    const line = document.createElementNS(NS, 'line')
    line.setAttribute('x1', String(ML - 4)); line.setAttribute('y1', String(y)); line.setAttribute('x2', String(chartW)); line.setAttribute('y2', String(y))
    line.setAttribute('stroke', 'var(--color-border)'); line.setAttribute('stroke-width', '1')
    svg.appendChild(line)
    const txt = document.createElementNS(NS, 'text')
    txt.setAttribute('x', String(ML - 6)); txt.setAttribute('y', String(y + 4)); txt.setAttribute('text-anchor', 'end'); txt.setAttribute('font-size', '9'); txt.setAttribute('fill', 'var(--color-text-secondary)')
    txt.textContent = axisLabel(v)
    svg.appendChild(txt)
  }
  const tooltip = el('div', 'overview-chart-tooltip', null)
  container.appendChild(tooltip)
  years.forEach((y, i) => {
    const xBase = ML + i * colW
    const rev = bg.revenue[y] || {}
    ;[['projected', 'Projected', 'var(--color-chart-bar)', 0], ['closed', 'Closed', 'var(--color-brand-primary)', barW + gap]].forEach(([type, label, fill, dx]) => {
      const val = parseMoney(rev[type])
      if (!(val > 0)) return
      const bh = chartH - yScale(val), by = yScale(val) + 10
      const rect = document.createElementNS(NS, 'rect')
      rect.setAttribute('x', String(xBase + dx)); rect.setAttribute('y', String(by)); rect.setAttribute('width', String(barW)); rect.setAttribute('height', String(bh))
      rect.setAttribute('fill', fill); rect.setAttribute('rx', '3'); rect.style.cursor = 'pointer'
      rect.addEventListener('mouseenter', () => { tooltip.style.display = 'block'; tooltip.textContent = y + ' ' + label + ': ' + (rev[type] || String(val)) })
      rect.addEventListener('mousemove', e => { tooltip.style.left = (e.clientX + 10) + 'px'; tooltip.style.top = (e.clientY - 28) + 'px' })
      rect.addEventListener('mouseleave', () => { tooltip.style.display = 'none' })
      rect.addEventListener('click', () => openBarEdit(y, type, bg, container, xBase + dx, by, onSave))
      svg.appendChild(rect)
    })
    const xt = document.createElementNS(NS, 'text')
    xt.setAttribute('x', String(xBase + barW + gap / 2)); xt.setAttribute('y', String(H - 8)); xt.setAttribute('text-anchor', 'middle'); xt.setAttribute('font-size', '10'); xt.setAttribute('fill', 'var(--color-text-secondary)')
    xt.textContent = String(y)
    svg.appendChild(xt)
  })
  container.appendChild(svg)
}

function openBarEdit(year, type, bg, container, svgX, svgY, onSave) {
  const existing = container.querySelector('.bar-edit-input')
  if (existing) existing.remove()
  const inp = el('input', 'bar-edit-input overview-bar-edit-input', null)
  inp.type = 'text'
  inp.value = (bg.revenue[year] || {})[type] || ''
  inp.placeholder = 'e.g. $450K'
  // The chart fills its container from the top left, so SVG units are container pixels.
  inp.style.left = Math.max(0, svgX) + 'px'
  inp.style.top = Math.max(0, svgY - 30) + 'px'
  let done = false // Enter removes the input, which blurs it; Escape must not save either
  const commit = () => {
    if (done) return
    done = true
    const v = inp.value.trim()
    inp.remove(); onSave(revenuePatch(year, { [type]: v }))
  }
  inp.addEventListener('blur', commit)
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit() } if (e.key === 'Escape') { done = true; inp.remove() } })
  container.appendChild(inp); inp.focus(); inp.select()
}
