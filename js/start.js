'use strict';
// First screen for an account with nothing in it: start new, open a file or try a sample.
// The blank template and the sample use the plain Overview, Plans, People, Actions and Notes
// sheets, which import and export like any other workbook.

const STARTER_HEADERS = {
  People: ['ID', 'Name', 'Title', 'Department', 'ReportsTo', 'Notes'],
  Actions: ['ID', 'Description', 'Owner', 'Status', 'DueDate'],
  Notes: ['ID', 'Date', 'Type', 'Title', 'Attendees', 'Body'],
  Plans: ['ID', 'Year', 'Objective', 'RevenueTarget', 'Strategy', 'RisksSummary', 'LastReviewedAt', 'NextReviewAt'],
}

// Sheets as arrays of rows. With sample data it describes an invented account; without,
// only the headers and the Overview labels.
function starterAoas(withSample) {
  const o = withSample
    ? { name: 'Northwind Example', company: 'Northwind Traders (sample)', objective: 'Move from one pilot site to all four regions', strategy: 'Win the operations sponsor, then expand through IT', target: '$1.2M', risks: 'Budget review in Q1; IT lead is new', last: isoPlusDays(today(), -14), next: isoPlusDays(today(), 14) }
    : { name: '', company: '', objective: '', strategy: '', target: '', risks: '', last: '', next: '' }
  const aoas = {
    Overview: [['Field', 'Value'], ['Account Name', o.name], ['Client Company', o.company]],
    Plans: [STARTER_HEADERS.Plans],
    People: [STARTER_HEADERS.People],
    Actions: [STARTER_HEADERS.Actions],
    Notes: [STARTER_HEADERS.Notes],
  }
  if (withSample) {
    aoas.Plans.push(['plan1', String(new Date().getFullYear()), o.objective, o.target, o.strategy, o.risks, o.last, o.next])
    aoas.People.push(
      ['s1', 'Dana Reyes', 'Chief Executive', 'Executive', '', 'Final sign-off'],
      ['s2', 'Sam Ortiz', 'Chief Financial Officer', 'Finance', 'Dana Reyes', ''],
      ['s3', 'Priya Shah', 'VP Operations', 'Operations', 'Dana Reyes', 'Our sponsor'],
      ['s4', 'Marco Lee', 'IT Director', 'IT', 'Priya Shah', 'New in role'],
      ['s5', 'Jo Park', 'Business Analyst', 'IT', 'Marco Lee', ''],
      ['s6', 'Tess Wu', 'Procurement Lead', 'Finance', '', 'Not yet placed on the chart'])
    aoas.Actions.push(
      ['a1', 'Send the regional rollout proposal', 'Priya Shah', 'In Progress', isoPlusDays(today(), 3)],
      ['a2', 'Book the IT security review', 'Marco Lee', 'Open', isoPlusDays(today(), 10)],
      ['a3', 'Confirm the Q1 budget window', 'Sam Ortiz', 'Open', isoPlusDays(today(), -2)])
    aoas.Notes.push(['n1', isoPlusDays(today(), -14), 'Meeting', 'Quarterly check-in', 'Priya Shah; Marco Lee', 'Priya wants a rollout plan by month end. Marco asked for the security checklist first.'])
  }
  return aoas
}

function starterWorkbook(withSample) {
  const wb = XLSX.utils.book_new()
  const aoas = starterAoas(withSample)
  Object.keys(aoas).forEach(name => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoas[name]), name))
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

function loadSampleAccount() {
  const load = () => { importWorkbook(starterWorkbook(true), 'sample-account.xlsx'); fileHandle = null }
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
