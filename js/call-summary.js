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

function buildCallSummary() {
  const d = callSummaryData()
  const lines = [d.name + ' — call summary, ' + fmtDate(d.today), '']
  if (d.planRows.length) { d.planRows.forEach(r => lines.push(r[0] + ': ' + r[1])); lines.push('') }
  if (d.note) {
    lines.push('Last call: ' + fmtDate(d.note.date) + (d.note.title ? ' — ' + d.note.title : ''))
    if ((d.note.attendees || []).length) lines.push('Attendees: ' + d.note.attendees.join(', '))
    if (d.note.body) lines.push('', d.note.body)
    lines.push('')
  }
  lines.push('Open actions')
  if (!d.owners.length) lines.push('None.')
  d.owners.forEach(o => { lines.push(o); d.groups[o].forEach(x => lines.push('- ' + x.text + dueLabel(x))) })
  if (d.done.length) { lines.push('', 'Finished this week'); d.done.forEach(x => lines.push('- ' + x)) }
  const text = lines.join('\n')

  const h = []
  h.push('<h1>' + escHtml(d.name) + '</h1>')
  h.push('<p class="meta">Call summary, ' + escHtml(fmtDate(d.today)) + '</p>')
  if (d.planRows.length) h.push('<h2>Plan</h2>' + d.planRows.map(r => '<p><strong>' + escHtml(r[0]) + ':</strong> ' + escHtml(r[1]).replace(/\n/g, '<br>') + '</p>').join(''))
  if (d.note) {
    h.push('<h2>Last call</h2><p><strong>' + escHtml(fmtDate(d.note.date)) + (d.note.title ? ' — ' + escHtml(d.note.title) : '') + '</strong></p>')
    if ((d.note.attendees || []).length) h.push('<p>Attendees: ' + d.note.attendees.map(escHtml).join(', ') + '</p>')
    if (d.note.body) h.push('<p>' + escHtml(d.note.body).replace(/\n/g, '<br>') + '</p>')
  }
  h.push('<h2>Open actions</h2>')
  if (!d.owners.length) h.push('<p>None.</p>')
  d.owners.forEach(o => {
    h.push('<div class="owner-group"><div class="owner-name">' + escHtml(o) + '</div><ul>')
    d.groups[o].forEach(x => h.push('<li>' + escHtml(x.text) + escHtml(dueLabel(x)) + '</li>'))
    h.push('</ul></div>')
  })
  if (d.done.length) { h.push('<h2>Finished this week</h2><ul>'); d.done.forEach(x => h.push('<li>' + escHtml(x) + '</li>')); h.push('</ul>') }
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
    const copy = el('button', 'btn btn-primary', 'Copy text'); copy.type = 'button'
    copy.addEventListener('click', async () => { showToast((await copyToClipboard(s.text)) ? 'Call summary copied' : 'Could not copy. Select the text and copy it.') })
    const dl = el('button', 'btn btn-ghost', 'Download page'); dl.type = 'button'
    dl.addEventListener('click', () => {
      downloadHtml(s.html, s.fileName)
    })
    row.appendChild(copy); row.appendChild(dl)
    body.appendChild(row)
  } })
}
