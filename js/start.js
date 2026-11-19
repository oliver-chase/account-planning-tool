'use strict';
// First screen for an account with nothing in it: start new, open a file or try a sample.
// The blank template and the sample use the plain Overview, Plans, People, Actions and Notes
// sheets, which import and export like any other workbook.

// Sheets as arrays of rows. With sample data it describes an invented account; without,
// only the headers and the Overview labels.
function starterAoas(withSample) {
  const o = withSample
    ? { name: 'Northwind Example', company: 'Northwind Traders (sample)', objective: 'Move from one pilot site to all four regions', strategy: 'Win the operations sponsor, then expand through IT', target: '$1.2M', risks: 'Budget review in Q1; IT lead is new', last: isoPlusDays(today(), -14), next: isoPlusDays(today(), 14) }
    : { name: '', company: '', objective: '', strategy: '', target: '', risks: '', last: '', next: '' }
  const aoas = {
    Overview: [['Field', 'Value'], ['Account Name', o.name], ['Client Company', o.company]],
    Plans: [SHEET_HEADERS.Plans], People: [SHEET_HEADERS.People], Actions: [SHEET_HEADERS.Actions], Notes: [SHEET_HEADERS.Notes],
  }
  if (withSample) {
    const rows = (sheet, list) => list.forEach(v => aoas[sheet].push(sheetRow(sheet, v)))
    const due = n => isoPlusDays(today(), n)
    rows('Plans', [{ ID: 'plan1', Year: String(new Date().getFullYear()), Objective: o.objective, RevenueTarget: o.target, Strategy: o.strategy, RisksSummary: o.risks, LastReviewedAt: o.last, NextReviewAt: o.next }])
    rows('People', [
      { ID: 's1', Name: 'Dana Reyes', Title: 'Chief Executive', Department: 'Executive', Notes: 'Final sign-off' },
      { ID: 's2', Name: 'Sam Ortiz', Title: 'Chief Financial Officer', Department: 'Finance', ReportsTo: 'Dana Reyes' },
      { ID: 's3', Name: 'Priya Shah', Title: 'VP Operations', Department: 'Operations', ReportsTo: 'Dana Reyes', Notes: 'Our sponsor' },
      { ID: 's4', Name: 'Marco Lee', Title: 'IT Director', Department: 'IT', ReportsTo: 'Priya Shah', Notes: 'New in role' },
      { ID: 's5', Name: 'Jo Park', Title: 'Business Analyst', Department: 'IT', ReportsTo: 'Marco Lee' },
      { ID: 's6', Name: 'Tess Wu', Title: 'Procurement Lead', Department: 'Finance', Notes: 'Not yet placed on the chart' }])
    rows('Actions', [
      { ID: 'a1', Description: 'Send the regional rollout proposal', Owner: 'Priya Shah', Status: 'In Progress', DueDate: due(3) },
      { ID: 'a2', Description: 'Book the IT security review', Owner: 'Marco Lee', Status: 'Open', DueDate: due(10) },
      { ID: 'a3', Description: 'Confirm the Q1 budget window', Owner: 'Sam Ortiz', Status: 'Open', DueDate: due(-2) }])
    rows('Notes', [{ ID: 'n1', Date: due(-14), Type: 'Meeting', Title: 'Quarterly check-in', Attendees: 'Priya Shah; Marco Lee', Body: 'Priya wants a rollout plan by month end. Marco asked for the security checklist first.' }])
  }
  return aoas
}

function starterWorkbook(withSample) {
  const wb = XLSX.utils.book_new()
  const aoas = starterAoas(withSample)
  Object.keys(aoas).forEach(name => {
    const ws = XLSX.utils.aoa_to_sheet(aoas[name])
    formatDateCells(ws, name, aoas[name]) // the sample's dates are Excel dates, like the ones Update Excel writes
    XLSX.utils.book_append_sheet(wb, ws, name)
  })
  return wb
}

function isBlankAccount(s) {
  return !s.account.account_name && !s.account.client_company && !s.stakeholders.length && !s.actions.length &&
    !s.notes.length && !s.plans.length
}

function startNewAccount(name, personName, personTitle) {
  const n = String(name || '').trim()
  if (!n) return false
  state.account.account_name = n
  state.account.last_updated = today()
  const p = String(personName || '').trim()
  if (p) {
    state.stakeholders.push(newPerson(sanitizeName(p), String(personTitle || '').trim()))
  }
  persist()
  return true
}

// What a named account still lacks to be useful on a call: its first person and its first action.
function firstStepsMissing(s) {
  if (!s.account.account_name) return []
  const missing = []
  if (!s.stakeholders.length) missing.push('Add the first person under People.')
  if (!s.actions.length) missing.push('Add the first action under Actions.')
  return missing
}

// The hint's sentence: what is missing, and the tier while it is still unset.
function firstStepsText(s) {
  return firstStepsMissing(s).concat(s.background.account_tier ? [] : ['Set Account Tier when you know it.']).join(' ')
}

// A short hint under the heading of a new account. It goes away once a person and an action exist.
function renderFirstSteps() {
  const slot = document.getElementById('first-steps-slot')
  if (!slot) return
  slot.innerHTML = ''
  const missing = firstStepsMissing(state)
  if (!missing.length) return
  const card = el('div', 'app-card first-steps-card', null)
  card.setAttribute('role', 'status')
  card.appendChild(el('div', 'app-card-label', 'Next steps'))
  card.appendChild(el('p', 'fontSmall textSecondary', firstStepsText(state)))
  slot.appendChild(card)
}

function loadSampleAccount() {
  const load = () => { importWorkbook(starterWorkbook(true), 'sample-account.xlsx'); fileHandle = null; rememberFileStamp(''); forgetPersistedFileHandle() }
  if (!unsavedEdits) { load(); return }
  return confirmReplaceUnsavedEdits('The sample account').then(ok => { if (ok) load() })
}

function renderStartScreen() {
  const slot = document.getElementById('start-slot')
  if (!slot) return
  slot.innerHTML = ''
  const blank = isBlankAccount(state)
  document.body.classList.toggle('show-start', blank)
  if (!blank) return

  const card = el('div', 'start-card', null)
  card.appendChild(el('h2', 'start-title', 'Start your account plan'))
  card.appendChild(el('p', 'start-lead', 'Pick one way in. Your work saves in this browser as you type, and Update Excel keeps a workbook current.'))

  const options = el('div', 'start-options', null)
  const [newBtn, openBtn, sampleBtn] = [
    ['Start a new account', 'Name the account and add the first person.'],
    ['Open an Excel file', 'Continue from a workbook you already keep.'],
    ['Try a sample account', 'See a filled-in example you can edit and discard.'],
  ].map(([title, text]) => {
    const b = options.appendChild(buttonEl('start-option', null))
    b.appendChild(el('span', 'start-option-title', title)); b.appendChild(el('span', 'start-option-text', text))
    return b
  })
  card.appendChild(options)

  const form = el('form', 'start-form', null); form.hidden = true
  const field = (id, label, ph) => {
    const wrap = el('div', 'start-field', null)
    const lab = el('label', null, label); lab.htmlFor = id
    const inp = el('input', null, null); inp.id = id; inp.type = 'text'; inp.placeholder = ph
    wrap.appendChild(lab); wrap.appendChild(inp)
    return [wrap, inp]
  }
  const [nameWrap, nameInp] = field('start-account', 'Account name', 'Example Co')
  const [personWrap, personInp] = field('start-person', 'First person (optional)', 'Full name')
  const [titleWrap, titleInp] = field('start-title-input', 'Their title (optional)', 'Job title')
  const go = el('button', 'start-go', 'Create account'); go.type = 'submit'
  ;[nameWrap, personWrap, titleWrap, go].forEach(n => form.appendChild(n))
  form.addEventListener('submit', e => {
    e.preventDefault()
    if (!startNewAccount(nameInp.value, personInp.value, titleInp.value)) { showToast('Give the account a name to start.'); nameInp.focus(); return }
    renderAll()
  })
  card.appendChild(form)

  newBtn.addEventListener('click', () => { form.hidden = false; nameInp.focus() })
  openBtn.addEventListener('click', () => document.getElementById('btn-import').click())
  sampleBtn.addEventListener('click', () => loadSampleAccount())

  const links = el('p', 'start-links', null)
  const dl = (label, withSample, file) => {
    return buttonEl('start-link', label, () => XLSX.writeFile(starterWorkbook(withSample), file))
  }
  links.appendChild(dl('Download a blank workbook', false, 'account-template.xlsx'))
  links.appendChild(dl('Download the sample workbook', true, 'account-sample.xlsx'))
  card.appendChild(links)
  slot.appendChild(card)
}
