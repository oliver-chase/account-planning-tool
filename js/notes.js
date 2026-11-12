'use strict';
// Notes: one expandable card per call.

const NOTES_PAGE_SIZE = 6
let notesSearch = ''
let notesSortDir = 'desc'
let notesPage = 0
let notesFilterFrom = ''
let notesFilterTo = ''
const notesExpanded = new Set() // notes the user has open, kept across re-renders

function isoToDisplay(iso) { const p = (iso || '').split('-'); return p.length === 3 ? p[1] + '/' + p[2] + '/' + p[0] : '' }
function displayToIso(display) {
  const m = display.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const month = Number(m[1]), day = Number(m[2]), year = Number(m[3])
  // The regex accepts 13/45/2026, and Date rolls invalid parts into the next month. Round-trip
  // the parts through a real Date and compare, which also catches Feb 30 and Apr 31.
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
}
function notePreview(note) { const line = (note.body || '').split('\n').find(s => s.trim()); return line ? (line.length > 120 ? line.slice(0, 120) + '…' : line) : '' }
function noteToMarkdown(note) {
  let md = '# ' + (note.title || 'Note') + '\n\n*Date: ' + fmtDate(note.date) + '*  \n\n'
  md += '## Attendees\n\n' + (note.attendees || []).map(a => '- ' + a).join('\n') + '\n\n'
  md += '## Notes\n\n' + (note.body || '') + '\n'
  if (note.transcript_link) md += '\n[View Transcript](' + note.transcript_link + ')\n'
  return md
}

// Edits read the stored record, so two saves close together both keep their change.
const currentNote = n => state.notes.find(x => x.id === n.id) || n
function saveNote(n) { n.last_updated = today(); const i = state.notes.findIndex(x => x.id === n.id); if (i >= 0) state.notes[i] = n; persist() }
function deleteNote(n) { state.notes = state.notes.filter(x => x.id !== n.id); persist() }

function createNote() {
  const bg = state.background
  const cadenceNames = toArray(bg.meeting_attendees)
  const teamRaw = toArray(bg.account_team)
  const seen = new Set(); const allAttendees = []
  ;[...cadenceNames, ...teamRaw].forEach(n => { if (n && !seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); allAttendees.push(n) } })
  const title = (bg.meeting_title || '').trim() || 'Meeting'
  state.notes.unshift({ id: uid('note'), date: today(), type: 'Meeting', title, attendees: allAttendees, body: '', transcript_link: '', created_date: today(), last_updated: today() })
  // Show the new note: clear whatever would hide it, open it and put the cursor in its body.
  notesSearch = ''; notesFilterFrom = ''; notesFilterTo = ''; notesPage = 0; notesSortDir = 'desc'
  notesExpanded.add(state.notes[0].id)
  persist(); renderNotes()
  const body = document.querySelector('#notes-body-wrap [data-note-id="' + state.notes[0].id + '"] .note-body-text')
  if (body) body.focus()
}

function renderNotes() { renderKeepingFocus('notes-body-wrap', renderNotesBody) }

function renderNotesBody() {
  const root = document.getElementById('notes-body-wrap')
  root.innerHTML = ''
  const teamNames = allKnownNames(state.background)

  const header = el('div', 'app-section-header', null)
  header.appendChild(el('div', 'app-section-title', 'Notes'))
  const row2 = el('div', 'section-header-row2', null)
  const left = el('div', 'section-header-left', null)
  left.appendChild(inlineActionButton('Add note', createNote, { id: 'btn-add-note' }))
  row2.appendChild(left)
  const actionsWrap = el('div', 'module-section-actions module-section-actions-scroll', null)
  const search = el('input', 'notes-search', null); search.type = 'text'; search.placeholder = 'Search notes...'; search.setAttribute('aria-label', 'Search notes'); search.value = notesSearch
  // Typing re-renders the section and builds a new box, so hand the keyboard back to it with the caret at the end.
  search.addEventListener('input', () => { notesSearch = search.value; notesPage = 0; renderNotes(); const box = document.querySelector('#notes .notes-search'); if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length) } })
  actionsWrap.appendChild(search)
  const fromI = el('input', 'module-filter-date', null); fromI.type = 'date'; fromI.setAttribute('aria-label', 'Notes from date'); fromI.value = notesFilterFrom
  fromI.addEventListener('change', () => { notesFilterFrom = fromI.value; notesPage = 0; renderNotes() })
  actionsWrap.appendChild(fromI)
  const toI = el('input', 'module-filter-date', null); toI.type = 'date'; toI.setAttribute('aria-label', 'Notes to date'); toI.value = notesFilterTo
  toI.addEventListener('change', () => { notesFilterTo = toI.value; notesPage = 0; renderNotes() })
  actionsWrap.appendChild(toI)
  actionsWrap.appendChild(singleSelectEl([['desc', 'Newest first'], ['asc', 'Oldest first']], notesSortDir, v => { notesSortDir = v; notesPage = 0; renderNotes() }, 'sort-select'))
  row2.appendChild(actionsWrap)
  header.appendChild(row2)
  root.appendChild(header)

  let notes = state.notes.filter(n => {
    if (notesFilterFrom && n.date < notesFilterFrom) return false
    if (notesFilterTo && n.date > notesFilterTo) return false
    if (!notesSearch) return true
    const q = notesSearch.toLowerCase()
    if ((n.title || '').toLowerCase().includes(q)) return true
    if ((n.body || '').toLowerCase().includes(q)) return true
    if ((n.attendees || []).some(a => a.toLowerCase().includes(q))) return true
    return false
  })
  notes = [...notes].sort((a, b) => { const cmp = b.date.localeCompare(a.date) || b.created_date.localeCompare(a.created_date); return notesSortDir === 'desc' ? cmp : -cmp })

  if (!notes.length) root.appendChild(emptyResultsBox(state.notes.length ? 'No results' : 'No notes yet. Click Add note to start.'))
  const totalPages = Math.ceil(notes.length / NOTES_PAGE_SIZE)
  const safePage = Math.min(notesPage, Math.max(0, totalPages - 1))
  notes.slice(safePage * NOTES_PAGE_SIZE, (safePage + 1) * NOTES_PAGE_SIZE).forEach(n => root.appendChild(makeNoteCard(n, teamNames)))
  if (totalPages > 1) root.appendChild(paginationRow(safePage, totalPages, p => { notesPage = p; renderNotes() }))
}

function makeNoteCard(note, teamNames) {
  let expanded = notesExpanded.has(note.id)
  const card = el('div', 'note-card', null)
  card.dataset.noteId = note.id
  card.title = 'Last updated: ' + (note.last_updated || '')

  const btns = el('div', 'note-card-btns', null)
  const copyBtn = el('button', 'note-copy-btn', 'Copy')
  copyBtn.type = 'button'; copyBtn.title = 'Copy to clipboard'
  copyBtn.addEventListener('click', async e => {
    e.stopPropagation()
    flushPendingSaves() // text typed a moment ago is in the copy
    const ok = await copyToClipboard(noteToMarkdown(currentNote(note)))
    showToast(ok ? 'Copied to clipboard' : 'Copy failed. Select the text and copy it.')
  })
  btns.appendChild(copyBtn)
  btns.appendChild(compactRemoveButton('Delete note', () => {
    showModal({ title: 'Delete this note?', message: 'This removes its title, date, attendees, and body. This cannot be undone.', confirmLabel: 'Delete', dangerConfirm: true }).then(r => {
      if (r.buttonValue !== 'confirm') return
      notesExpanded.delete(note.id); deleteNote(note); renderNotes()
    })
  }, 'note-delete-btn'))
  card.appendChild(btns)

  const meta = el('div', 'note-meta', null)
  const dateSpan = editable('span', 'note-date note-date-editable', isoToDisplay(note.date), '', v => {
    const iso = displayToIso(v)
    if (iso) { saveNote({ ...currentNote(note), date: iso }); renderNotes() }
    else if (v.trim()) { showToast('Not a valid date. Kept ' + isoToDisplay(note.date)); renderNotes() }
  }, { ariaLabel: 'Note date', revertOnEmpty: true })
  dateSpan.title = 'Click to edit date (MM/DD/YYYY)'
  dateSpan.addEventListener('click', e => e.stopPropagation())
  meta.appendChild(dateSpan)
  card.appendChild(meta)

  const titleEl = editable('div', 'note-title note-title-el', note.title, '', v => { saveNote({ ...currentNote(note), title: v }); renderNotes() }, { ariaLabel: 'Note title' })
  titleEl.addEventListener('click', e => e.stopPropagation())
  card.appendChild(titleEl)

  const previewEl = el('div', 'note-preview', notePreview(note))
  card.appendChild(previewEl)

  const bodyWrap = el('div', 'note-body', null)
  bodyWrap.style.display = 'none'
  bodyWrap.addEventListener('click', e => e.stopPropagation())
  const attSection = el('div', 'bullet-section', null)
  attSection.appendChild(el('div', 'bullet-heading', 'Attendees'))
  const attRow = el('div', null, null)
  function renderAttendees() {
    attRow.innerHTML = ''
    attRow.appendChild(multiPicker(teamNames, note.attendees || [], next => {
      saveNote({ ...currentNote(note), attendees: next }); note.attendees = next; renderAttendees()
    }, 'Add attendee'))
  }
  renderAttendees()
  attSection.appendChild(attRow)
  bodyWrap.appendChild(attSection)
  bodyWrap.appendChild(el('div', 'bullet-heading', 'Notes'))
  bodyWrap.appendChild(editable('div', 'note-body-text', note.body, 'Add the call notes', v => { saveNote({ ...currentNote(note), body: v }); renderNotes() }, { multiline: true, ariaLabel: 'Note body' }))
  card.appendChild(bodyWrap)

  function showExpanded() {
    card.classList.toggle('expanded', expanded)
    card.setAttribute('aria-label', (note.title || 'Note') + (expanded ? ', expanded' : ', collapsed'))
    bodyWrap.style.display = expanded ? 'block' : 'none'
    previewEl.style.display = expanded ? 'none' : ''
  }
  function toggleNote() {
    expanded = !expanded
    if (expanded) notesExpanded.add(note.id); else notesExpanded.delete(note.id)
    showExpanded()
  }
  card.addEventListener('click', e => {
    if (e.target.closest('[contenteditable],button,input,select,.app-chip')) return
    toggleNote()
  })
  makeActivatable(card, null, toggleNote)
  showExpanded()
  return card
}
