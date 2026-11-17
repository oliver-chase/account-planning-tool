'use strict';
// Call summary: the last call's note, open actions by owner with due dates, and what was
// finished this week. Shown as text to paste into an email, and as a page to download.

function callSummaryData() {
  const t = today()
  const weekAgo = isoPlusDays(t, -7)
  const note = [...state.notes].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] || null
  const groups = Object.create(null) // an owner can be named constructor
  state.actions.filter(a => a.status === 'Open' || a.status === 'In Progress').forEach(a => {
    const owner = (a.owner || '').trim() || 'No owner'
    ;(groups[owner] = groups[owner] || []).push({ text: a.description, due: a.due_date || '', overdue: isPastDue(a, t) })
  })
  const owners = Object.keys(groups).filter(o => o !== 'No owner').sort()
  if (groups['No owner']) owners.push('No owner')
  owners.forEach(o => groups[o].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')))
  const done = state.actions.filter(a => a.status === 'Done' && a.closed_date && a.closed_date > weekAgo).map(a => a.description)
  const plan = currentPlan() || {}
  const planRows = [['Objective', plan.objective], ['Strategy', plan.strategy], ['Revenue target', plan.revenue_target], ['Risks and watch items', plan.risks_summary],
    ['Next review', plan.next_review_at ? fmtDate(String(plan.next_review_at).slice(0, 10)) : '']].filter(r => r[1])
  return { today: t, name: state.account.account_name || 'Account', note, owners, groups, done, planRows }
}

function dueLabel(x) { return x.due ? (x.overdue ? ' (overdue, was due ' : ' (due ') + fmtDate(x.due) + ')' : '' }

// The sections both outputs print, in order: plan rows, the last call, open actions by owner and the finished list.
function callSummarySections(d) {
  const sections = []
  if (d.planRows.length) sections.push({ title: 'Plan', rows: d.planRows })
  if (d.note) {
    const n = d.note
    sections.push({ title: 'Last call', lead: fmtDate(n.date) + (n.title ? ' — ' + n.title : ''),
      meta: (n.attendees || []).length ? 'Attendees: ' + n.attendees.join(', ') : '', body: n.body || '' })
  }
  sections.push({ title: 'Open actions', empty: !d.owners.length, groups: d.owners.map(o => [o, d.groups[o]]) })
  if (d.done.length) sections.push({ title: 'Finished this week', items: d.done })
  return sections
}

function buildCallSummary() {
  const d = callSummaryData()
  const sections = callSummarySections(d)
  const lines = [d.name + ' — call summary, ' + fmtDate(d.today)]
  sections.forEach(s => {
    lines.push('')
    if (s.lead) lines.push(s.title + ': ' + s.lead); else if (!s.rows) lines.push(s.title)
    ;(s.rows || []).forEach(r => lines.push(r[0] + ': ' + r[1]))
    if (s.meta) lines.push(s.meta)
    if (s.body) lines.push('', s.body)
    if (s.empty) lines.push('None.')
    ;(s.groups || []).forEach(([o, xs]) => { lines.push(o); xs.forEach(x => lines.push('- ' + x.text + dueLabel(x))) })
    ;(s.items || []).forEach(x => lines.push('- ' + x))
  })
  const text = lines.join('\n')

  const h = ['<h1>' + escHtml(d.name) + '</h1>', '<p class="meta">Call summary, ' + escHtml(fmtDate(d.today)) + '</p>']
  const paragraph = t => '<p>' + escHtml(t).replace(/\n/g, '<br>') + '</p>'
  sections.forEach(s => {
    h.push('<h2>' + escHtml(s.title) + '</h2>')
    if (s.lead) h.push('<p><strong>' + escHtml(s.lead) + '</strong></p>')
    ;(s.rows || []).forEach(r => h.push('<p><strong>' + escHtml(r[0]) + ':</strong> ' + escHtml(r[1]).replace(/\n/g, '<br>') + '</p>'))
    if (s.meta) h.push(paragraph(s.meta))
    if (s.body) h.push(paragraph(s.body))
    if (s.empty) h.push('<p>None.</p>')
    ;(s.groups || []).forEach(([o, xs]) => h.push('<div class="owner-group"><div class="owner-name">' + escHtml(o) + '</div><ul>' +
      xs.map(x => '<li>' + escHtml(x.text) + escHtml(dueLabel(x)) + '</li>').join('') + '</ul></div>'))
    if (s.items) h.push('<ul>' + s.items.map(x => '<li>' + escHtml(x) + '</li>').join('') + '</ul>')
  })
  const style = 'body{font-family:' + BRAND.fontFamily + ';font-size:13px;color:#1a1a1a;max-width:640px;margin:0 auto;padding:32px}h1{font-size:22px;margin-bottom:4px}h2{font-size:15px;border-bottom:1px solid #ddd;padding-bottom:4px;margin-top:24px}.meta{color:#4a4a4e}.owner-name{font-weight:bold;margin:8px 0 4px}ul{margin:0;padding-left:18px}'
  const title = d.name + ' call summary'
  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + escHtml(title) + '</title><style>' + style + '</style></head><body>' + h.join('') + '</body></html>'
  return { title, fileName: slugify(d.name) + '-call-summary-' + d.today + '.html', text, html }
}

function openCallSummary() {
  const s = buildCallSummary()
  showModal({ title: 'Call summary', hideActions: true, bodyBuilder: (body, close) => {
    body.appendChild(el('p', 'export-helper-text', 'Copy the text into an email, or download it as a page.'))
    const pre = el('textarea', 'call-summary-text', null)
    pre.value = s.text; pre.readOnly = true; pre.rows = 14; pre.setAttribute('aria-label', 'Call summary text')
    body.appendChild(pre)
    const row = el('div', 'call-summary-actions', null)
    const copy = buttonEl('btn btn-primary', 'Copy text', async () => { showToast((await copyToClipboard(s.text)) ? 'Call summary copied' : 'Could not copy. Select the text and copy it.') })
    const dl = buttonEl('btn btn-ghost', 'Download page', () => downloadHtml(s.html, s.fileName))
    row.appendChild(copy); row.appendChild(dl)
    body.appendChild(row)
  } })
}
