'use strict'
// Loads the built page in a simulated browser (jsdom) and walks the main features:
// the sample account, Plan edits, the historical-year form, keyboard access, the org chart and its
// download, and empty lists. Needs `npm install`; without it the test says so and
// passes. Run: node tests/dom.js
let JSDOM, VirtualConsole
try { ({ JSDOM, VirtualConsole } = require('jsdom')) } catch (e) {
  if (e.code === 'MODULE_NOT_FOUND') { console.log('dom: jsdom is not installed, skipping (run npm install)'); process.exit(0) }
  console.log('dom: jsdom is installed but cannot load on Node ' + process.version + ': ' + e.message.split('\n')[0]); process.exit(1)
}
const fs = require('fs'), assert = require('assert')
const html = fs.readFileSync(require('path').join(__dirname, '..', 'account-planning-tool.html'), 'utf8')
const errors = []
const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(String(e.detail || e.message || e).slice(0, 200)))
const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) { w.addEventListener('error', e => errors.push('window error: ' + e.message)); w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, addEventListener() {} })) } })
const w = dom.window, d = w.document
const wait = ms => new Promise(r => setTimeout(r, ms))
const ev = (n, t, init) => n.dispatchEvent(new w.KeyboardEvent(t, { bubbles: true, cancelable: true, ...init }))
const ok = []; const check = (name, cond) => { assert.ok(cond, name); ok.push(name) }
// Polls until fn() holds, for at most two seconds, so each step waits only as long as the page needs.
const until = async fn => { for (const end = Date.now() + 2000; !fn() && Date.now() < end;) await wait(10) }
// A check whose condition may need a render, a debounced save or an animation frame first.
const checkSoon = async (name, fn) => { await until(fn); check(name, fn()) }
// Every blur-debounced save has landed.
const saved = () => until(() => w.eval('pendingEditSaves.size === 0'))
;(async () => {
  await until(() => d.querySelector('.start-option'))
  // 1. sample account loads
  const sample = [...d.querySelectorAll('.start-option')].find(b => /sample/i.test(b.textContent)); assert.ok(sample, 'start screen has a sample option')
  sample.click()
  await checkSoon('sample account loads people, actions, a plan', () => w.eval('state.stakeholders.length >= 5 && state.actions.length >= 3 && state.plans.length === 1'))
  // 2. plan header edit raises no error
  const before = errors.length
  const objective = d.querySelector('.plan-header-card [contenteditable], .plan-header-card textarea, .plan-header-card input')
  assert.ok(objective, 'plan header has an editable field')
  if (objective.isContentEditable !== undefined && objective.getAttribute('contenteditable') !== null) { objective.focus(); objective.textContent = 'New objective'; objective.dispatchEvent(new w.Event('blur')) }
  else { objective.value = objective.type === 'date' ? '2026-12-31' : 'New objective'; objective.dispatchEvent(new w.Event('change')); objective.dispatchEvent(new w.Event('blur')) }
  await saved()
  check('editing a Plan field raises no error', errors.length === before)
  // 3. historical year form prefills stored values
  w.eval("state.background.revenue = { '" + (new Date().getFullYear() - 1) + "': { projected: '$500K', closed: '$300K' } }; persist(); renderOverview()")
  const hist = [...d.querySelectorAll('button')].find(b => /Add historical year/i.test(b.textContent)); assert.ok(hist, 'Add historical year button')
  hist.click()
  await until(() => d.querySelectorAll('.overview-hist-input').length === 2)
  const inputs = [...d.querySelectorAll('.overview-hist-input')]
  check('historical year form is prefilled with the stored figures', inputs.length === 2 && inputs[0].value === '$500K' && inputs[1].value === '$300K')
  // 4. cadence summary opens from the keyboard
  w.eval("state.background.meeting_frequency='weekly'; persist(); renderOverview()")
  const row = d.querySelector('.overview-cadence-summary-row'); const exp0 = row.getAttribute('aria-expanded')
  row.focus(); ev(row, 'keydown', { key: 'Enter' })
  await checkSoon('cadence summary toggles with Enter', () => d.querySelector('.overview-cadence-summary-row').getAttribute('aria-expanded') !== exp0 || row.getAttribute('aria-expanded') !== exp0)
  // 5. org chart view: Enter on remove button does not open the panel
  location_hash(w, 'people'); await until(() => d.querySelector('.app-view-toggle-btn'))
  const orgBtn = [...d.querySelectorAll('.app-view-toggle-btn')].find(b => /org/i.test(b.textContent)); assert.ok(orgBtn, 'org view toggle'); orgBtn.click(); await until(() => d.querySelector('.org-node-card .org-unlink-btn'))
  const removeBtn = d.querySelector('.org-node-card .org-unlink-btn'); assert.ok(removeBtn, 'a card has a remove button')
  removeBtn.focus(); ev(removeBtn, 'keydown', { key: 'Enter' }); await wait(20)
  check('Enter on a remove button does not open the person panel', !d.getElementById('org-person-panel'))
  // 6. Space on a card focuses it again after the rebuild
  const card = d.querySelector('.org-node-card'); const id = card.dataset.id; card.focus(); ev(card, 'keydown', { key: ' ' })
  await checkSoon('card keeps focus after Space', () => d.activeElement && d.activeElement.dataset && d.activeElement.dataset.id === id)
  ev(d.activeElement, 'keydown', { key: 'Escape' }); await wait(20)
  // 7. zoom redraws the lines
  w.eval('window.__draws = 0; const _d = drawOrgLines; drawOrgLines = function () { window.__draws++; return _d.apply(this, arguments) }')
  const zin = [...d.querySelectorAll('.org-zoom-controls button')].find(b => /in/i.test(b.textContent) && /zoom/i.test(b.textContent)); const scale0 = d.querySelector('.org-tree').style.transform; zin.click()
  await checkSoon('zoom in scales the chart and redraws the connector lines', () => w.__draws >= 1 && d.querySelector('.org-tree').style.transform !== scale0)
  // 8. org chart download is static
  let captured = ''; w.eval('window.__cap = null; downloadHtml = function (h, n) { window.__cap = h }'); w.eval('downloadOrgChart()'); await until(() => w.__cap)
  captured = w.__cap || ''
  check('org chart download has cards and no interactive attributes', captured.includes('org-node-card') && captured.includes('<body>') && !/tabindex|draggable/i.test(captured.split('<body>')[1]))
  // 8b. a stale pick is cleared, the side panel shows More fields, deleting closes the panel, filters keep focus
  w.eval("orgPickedId = 'x'; peopleView = 'cards'; renderPeople()")
  check('a stale org pick is cleared on render', w.eval('orgPickedId === null'))
  w.eval('openPersonDetail(state.stakeholders[0])'); await until(() => d.querySelector('#org-person-panel .person-more-toggle'))
  const moreBtn = d.querySelector('#org-person-panel .person-more-toggle'); const moreLabel = moreBtn.textContent
  moreBtn.click()
  await checkSoon('More fields works in the side panel', () => d.querySelector('#org-person-panel .person-more-toggle').textContent !== moreLabel)
  w.eval("showModal = async () => ({ buttonValue: 'confirm' }); confirmDeletePerson(state.stakeholders[state.stakeholders.length - 1])")
  await checkSoon('deleting a person closes the side panel', () => !d.getElementById('org-person-panel'))
  w.eval("peopleFilterPanelOpen = true; renderPeople()"); await until(() => d.querySelector('[data-fk="exec"]'))
  const exec = d.querySelector('[data-fk="exec"]'); exec.focus(); exec.checked = true; exec.dispatchEvent(new w.Event('change'))
  await checkSoon('a filter change keeps keyboard focus', () => d.activeElement && d.activeElement.dataset && d.activeElement.dataset.fk === 'exec')
  // 8c. a weekday chip keeps focus after the overview rebuilds, and Escape closes the Filters panel
  w.eval("state.background.meeting_frequency = 'weekly'; renderOverview()"); await until(() => d.querySelector('[data-fk="day-Wed"]'))
  const chip = d.querySelector('[data-fk="day-Wed"]'); chip.focus(); chip.click()
  await checkSoon('a weekday chip keeps focus after the overview rebuilds', () => d.activeElement && d.activeElement.dataset && d.activeElement.dataset.fk === 'day-Wed')
  w.eval("peopleView = 'cards'; peopleFilterPanelOpen = true; renderPeople()"); await until(() => d.querySelector('.people-filter-panel [data-fk="exec"]'))
  ev(d.querySelector('.people-filter-panel [data-fk="exec"]'), 'keydown', { key: 'Escape' })
  await checkSoon('Escape closes the Filters panel', () => !d.querySelector('.people-filter-panel'))
  // 8d. a new action keeps the owner and due date chosen after the description
  w.eval("state.actions = []; actionsAdding = true; renderActions()"); await until(() => d.querySelector('tr.new-row .action-text'))
  const newDesc = d.querySelector('tr.new-row .action-text'); newDesc.textContent = 'Call the sponsor'; newDesc.dispatchEvent(new w.Event('blur')); await saved()
  const dueIn = d.querySelector('tr.new-row input[type=date]')
  check('the new action row stays while the person fills in the date', !!dueIn && w.eval('state.actions.length === 1'))
  dueIn.value = '2026-12-31'; dueIn.dispatchEvent(new w.Event('change'))
  await checkSoon('the due date lands on the new action', () => w.eval("state.actions[0].due_date === '2026-12-31'"))
  // The new row's owner picker shows its pick and can clear it, though the row never re-renders.
  w.eval("state.background.account_team = 'Ann Lee'")
  const ownerBtn = d.querySelector('tr.new-row .picker-btn-inline'); ownerBtn.click()
  await until(() => d.querySelector('.app-popover .app-popover-item'))
  ;[...d.querySelectorAll('.app-popover .app-popover-item')].find(i => i.textContent === 'Ann Lee').click()
  ownerBtn.click(); await until(() => d.querySelector('.app-popover .app-popover-item'))
  check('the new row owner can be cleared after a pick', [...d.querySelectorAll('.app-popover .app-popover-item')].some(i => /Clear selection/.test(i.textContent)))
  ev(d.activeElement || d.body, 'keydown', { key: 'Escape' })
  w.eval("actionsAdding = false; renderActions()")
  // 9. empty lists say so
  w.eval("state.notes = []; state.actions = []; persist(); renderNotes(); renderActions()")
  check('empty Notes and Actions explain themselves', /No notes yet/.test(d.getElementById('notes-body-wrap').textContent) && /No actions yet/.test(d.getElementById('actions-body-wrap').textContent))
  if (errors.length) { console.log('page errors:', errors); process.exit(1) }
  console.log('dom: ok (' + ok.length + ' checks)')
  process.exit(0)
})().catch(e => { console.log('FAIL:', e.message.slice(0, 300), '\nchecks passed:', ok.length, '\npage errors:', errors); process.exit(1) })
function location_hash(w, h) { w.location.hash = '#' + h }
