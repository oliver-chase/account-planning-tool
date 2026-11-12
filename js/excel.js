'use strict';
// The workbook is the record: one plainly named sheet per type (Overview, Revenue, People, Actions, Notes, Plans).
//
// Engagement links are stored as plain text labels ("Account-wide" or a name).

const SHEET_BASES = ['Overview', 'Revenue', 'People', 'Actions', 'Notes', 'Plans']

// Excel date cells arrive as Date objects when the workbook is read with cellDates. Turn each
// into the local calendar day, so a due date typed in Excel is not shown as a serial number.
function cellValue(v) { return Object.prototype.toString.call(v) === '[object Date]' ? localISO(v) : v }

function sheetRowsByName(wb, name) {
  const ws = wb.Sheets[name]
  if (!ws) return null
  return XLSX.utils.sheet_to_json(ws, { defval: '' }).map(r => { Object.keys(r).forEach(k => { r[k] = cellValue(r[k]) }); return r })
}

// Reads a status typed any way (open, In-Progress, complete) as one of the three the screens know.
let unknownStatuses = 0 // statuses the last import could not read
function actionStatus(v) {
  const t = String(v || '').trim().toLowerCase().replace(/[-_\s]+/g, ' ')
  if (t && !['open', 'in progress', 'inprogress', 'done', 'complete', 'completed', 'closed'].includes(t)) unknownStatuses++
  if (t === 'in progress' || t === 'inprogress') return 'In Progress'
  if (t === 'done' || t === 'complete' || t === 'completed' || t === 'closed') return 'Done'
  return 'Open'
}

// Parses the workbook's sheets (base name to rows) into the live state shape.
function parseStateFromRows(getRows, sourceName) {
  // Two rows with one ID would overwrite each other on the first edit, so a repeated ID gets a new one.
  const seenIds = new Set()
  const idOf = (r, prefix) => { let id = String(r.ID || '').trim(); if (!id || seenIds.has(id)) id = uid(prefix); seenIds.add(id); return id }
  const next = emptyState()
  next.meta.sourceFileName = sourceName || ''
  next.meta.importedAt = today()

  const overview = getRows('Overview')
  if (overview) {
    const map = {
      'Account Name': ['account', 'account_name'],
      'Client Company': ['account', 'client_company'],
      'Status': ['account', 'status'],
      'Account Tier': ['background', 'account_tier'],
      'Account Director': ['background', 'account_director'],
      'Account Manager': ['background', 'account_manager'],
      'Account Team': ['background', 'account_team'],
      'Meeting Title': ['background', 'meeting_title'],
      'Meeting Frequency': ['background', 'meeting_frequency'],
      'Meeting Day': ['background', 'meeting_day'],
      'Meeting Interval': ['background', 'meeting_interval'],
      'Recurring Attendees': ['background', 'meeting_attendees'],
      'Next Meeting Override': ['background', 'next_meeting_override'],
      'Account Notes': ['background', 'strategic_context'],
    }
    overview.forEach(r => {
      const field = String(r.Field || '').trim()
      const value = String(r.Value != null ? r.Value : '').trim()
      const dest = map[field]
      if (dest) next[dest[0]][dest[1]] = value
    })
  }

  const revenue = getRows('Revenue')
  if (revenue) {
    revenue.forEach(r => {
      const year = String(r.Year || '').trim()
      if (!year) return
      next.background.revenue[year] = {
        projected: String(r.Projected || '').trim(),
        closed: String(r.Closed || '').trim(),
      }
    })
  }

  const people = getRows('People')
  if (people) {
    const nameToId = Object.create(null)
    const idSet = new Set()
    people.forEach(r => {
      const id = idOf(r, 'p')
      const name = String(r.Name || '').trim()
      idSet.add(id)
      // Ambiguous on a duplicate name: leave unset here and let ReportsToID (below) be the
      // real source of truth for sheets this tool wrote. Only used as a last-resort fallback
      // for legacy/hand-edited sheets that don't carry ReportsToID at all.
      if (!(name.toLowerCase() in nameToId)) nameToId[name.toLowerCase()] = id
      else nameToId[name.toLowerCase()] = null
      next.stakeholders.push({
        id, name,
        title: String(r.Title || '').trim(),
        department: String(r.Department || '').trim(),
        organization: String(r.Organization || 'Client').trim(),
        is_executive: String(r.IsExecutive || 'false').trim(),
        sentiment: String(r.Sentiment || 'Unknown').trim(),
        worker_type: String(r.WorkerType || '').trim() || 'Client Employee',
        primary_owner: String(r.PrimaryOwner || '').trim(),
        secondary_owner: String(r.SecondaryOwner || '').trim(),
        engagement: String(r.Engagement || '').trim(),
        notes: String(r.Notes || '').trim(),
        reports_to: '',
        _reportsToName: String(r.ReportsTo || '').trim(),
        _reportsToId: String(r.ReportsToID || '').trim(),
        created_date: today(), last_updated: today(),
      })
    })
    const byId = Object.fromEntries(next.stakeholders.map(p => [p.id, p]))
    next.stakeholders.forEach(p => {
      // ReportsTo is the name a person reads and edits in Excel; ReportsToID is the reference this
      // tool writes beside it, which survives duplicate names. The ID wins while its person still
      // carries the ReportsTo name. An edited or cleared name wins, unless it names two people.
      const want = (p._reportsToName || '').toLowerCase()
      const byRef = p._reportsToId && idSet.has(p._reportsToId) && p._reportsToId !== p.id ? p._reportsToId : ''
      const matched = want ? nameToId[want] : ''
      if (byRef && (byId[byRef].name.toLowerCase() === want || matched === null)) p.reports_to = byRef
      else if (matched && matched !== p.id) p.reports_to = matched
      delete p._reportsToName
      delete p._reportsToId
    })
  }

  const actions = getRows('Actions')
  if (actions) actions.forEach(r => { const status = actionStatus(r.Status); next.actions.push({
    id: idOf(r, 'act'),
    description: String(r.Description || '').trim(),
    owner: String(r.Owner || '').trim(),
    engagement: String(r.Engagement || '').trim(),
    status,
    due_date: String(r.DueDate || '').trim(),
    closed_date: String(r.ClosedDate || '').trim(),
    created_date: String(r.CreatedDate || today()).trim(),
    last_updated: today(),
  }) })

  const notes = getRows('Notes')
  if (notes) notes.forEach(r => next.notes.push({
    id: idOf(r, 'note'),
    date: String(r.Date || today()).trim(),
    type: String(r.Type || 'Meeting').trim(),
    title: String(r.Title || '').trim(),
    attendees: toArray(r.Attendees),
    body: String(r.Body || '').trim(),
    transcript_link: String(r.TranscriptLink || '').trim(),
    created_date: String(r.CreatedDate || today()).trim(),
    last_updated: today(),
  }))

  const plans = getRows('Plans')
  if (plans) plans.forEach(r => {
    const planId = idOf(r, 'plan')
    const plan = {
      id: planId,
      year: String(r.Year || new Date().getFullYear()).trim(),
      objective: String(r.Objective || '').trim(),
      revenue_target: String(r.RevenueTarget || '').trim(),
      strategy: String(r.Strategy || '').trim(),
      risks_summary: String(r.RisksSummary || '').trim(),
      last_reviewed_at: String(r.LastReviewedAt || '').trim(),
      next_review_at: String(r.NextReviewAt || '').trim(),
    }
    next.plans.push(plan)
  })

  return next
}

function importWorkbook(wb, sourceName) {
  flushPendingSaves()
  unknownStatuses = 0
  const next = parseStateFromRows(base => sheetRowsByName(wb, base), sourceName)
  state = next
  // A different account's data is about to render. UI-only state left over from the previous
  // account (overview.js's cadence-panel open/closed flag) was derived from that account's
  // meeting frequency, so it resets here.
  resetOverviewCadenceUI()
  const cutLoops = breakReportingCycles(state.stakeholders)
  persist()
  markSynced()
  renderAll()
  if (cutLoops) showToast('Removed ' + cutLoops + ' circular reporting line' + (cutLoops === 1 ? '' : 's') + ' from the file.')
  setSyncState('ok', 'Imported ' + (sourceName || 'workbook'))
  showToast('Imported ' + (sourceName || 'workbook') + (unknownStatuses ? '. ' + unknownStatuses + ' action status' + (unknownStatuses === 1 ? '' : 'es') + ' not recognized were read as Open.' : ''))
}

// Pure data, no XLSX calls — the named sheet arrays that become the workbook.
function buildAoasFromState() {
  const a = state.account, b = state.background
  const aoas = {}

  aoas.Overview = [
    ['Field', 'Value'],
    ['Account Name', a.account_name], ['Client Company', a.client_company], ['Status', a.status],
    ['Account Tier', b.account_tier], ['Account Director', b.account_director],
    ['Account Manager', b.account_manager], ['Account Team', b.account_team],
    ['Meeting Title', b.meeting_title], ['Meeting Frequency', b.meeting_frequency],
    ['Meeting Day', b.meeting_day], ['Meeting Interval', b.meeting_interval],
    ['Recurring Attendees', b.meeting_attendees], ['Next Meeting Override', b.next_meeting_override],
    ['Account Notes', b.strategic_context],
  ]

  aoas.Revenue = [['Year', 'Projected', 'Closed']]
  Object.keys(b.revenue).sort().forEach(y => aoas.Revenue.push([y, b.revenue[y].projected || '', b.revenue[y].closed || '']))

  // ReportsTo is the human-readable name (what someone sees/edits in Excel); ReportsToID is
  // the stable row-id reference this tool itself round-trips on, immune to the duplicate-name
  // collision ReportsTo alone has (see the People parsing in parseStateFromRows).
  aoas.People = [['ID', 'Name', 'Title', 'Department', 'Organization', 'IsExecutive', 'Sentiment', 'WorkerType', 'PrimaryOwner', 'SecondaryOwner', 'ReportsTo', 'ReportsToID', 'Engagement', 'Notes']]
  state.stakeholders.forEach(p => {
    const mgr = p.reports_to ? (state.stakeholders.find(x => x.id === p.reports_to) || {}).name || '' : ''
    aoas.People.push([p.id, p.name, p.title, p.department, p.organization, p.is_executive, p.sentiment, p.worker_type, p.primary_owner, p.secondary_owner, mgr, p.reports_to || '', p.engagement, p.notes])
  })

  aoas.Actions = [['ID', 'Description', 'Owner', 'Engagement', 'Status', 'DueDate', 'ClosedDate', 'CreatedDate']]
  state.actions.forEach(x => aoas.Actions.push([x.id, x.description, x.owner, x.engagement, x.status, x.due_date || '', x.closed_date, x.created_date]))

  aoas.Notes = [['ID', 'Date', 'Type', 'Title', 'Attendees', 'Body', 'TranscriptLink', 'CreatedDate']]
  state.notes.forEach(x => aoas.Notes.push([x.id, x.date, x.type, x.title, (x.attendees || []).join('; '), x.body, x.transcript_link, x.created_date]))

  aoas.Plans = [['ID', 'Year', 'Objective', 'RevenueTarget', 'Strategy', 'RisksSummary', 'LastReviewedAt', 'NextReviewAt']]
  state.plans.forEach(p => {
    aoas.Plans.push([p.id, p.year, p.objective, p.revenue_target, p.strategy, p.risks_summary, p.last_reviewed_at, p.next_review_at])
  })

  return aoas
}

// A sheet worth writing: the Overview always, any other only if it holds a value besides
// its labels and headers.
function sheetHasContent(base, aoa) {
  if (base === 'Overview') return true
  return aoa.slice(1).some(row => row.some(c => String(c == null ? '' : c).trim() !== ''))
}

function buildWorkbook() {
  const wb = XLSX.utils.book_new()
  const aoas = buildAoasFromState()
  // One plainly named sheet per type, and none for a type with nothing in it.
  SHEET_BASES.forEach(base => {
    if (aoas[base] && sheetHasContent(base, aoas[base])) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoas[base]), base)
  })
  return wb
}

function exportFileName() { return slugify(state.account.account_name) + '.xlsx' }

// Names the sheets and columns in the file at `handle` that Update Excel is about to remove, because this
// tool rewrites only the sheets and columns it owns. A file it cannot read has nothing to name.
async function contentUpdateWouldRemove(handle, wb) {
  try {
    const old = XLSX.read(await (await handle.getFile()).arrayBuffer(), { type: 'array' })
    const lost = []
    old.SheetNames.forEach(name => {
      const rows = XLSX.utils.sheet_to_json(old.Sheets[name], { header: 1 })
      const hasData = c => rows.slice(1).some(r => String(r[c] == null ? '' : r[c]).trim() !== '')
      if (!wb.SheetNames.includes(name)) { if (rows[0] && rows[0].some((h, c) => hasData(c))) lost.push('the sheet ' + name); return }
      const keeps = (XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 })[0] || []).map(String)
      ;(rows[0] || []).forEach((h, c) => { if (h && !keeps.includes(String(h)) && hasData(c)) lost.push('the column ' + h + ' on ' + name) })
    })
    return lost
  } catch (e) { return [] }
}

async function updateExcel() {
  flushPendingSaves() // an edit blurred a moment ago is in the file
  const wb = buildWorkbook()
  const changesAtSnapshot = changeCount // an edit made while the save runs is not in the file, so it stays unsaved
  if (window.showSaveFilePicker) {
    try {
      let handle = fileHandle
      if (!handle) {
        handle = await window.showSaveFilePicker({
          suggestedName: exportFileName(),
          types: [{ description: 'Excel Workbook', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
        })
      }
      if (handle === fileHandle && fileStamp()) {
        let now = ''
        try { now = String((await handle.getFile()).lastModified || '') } catch (e) { /* unreadable: the write reports it */ }
        if (now && now !== fileStamp()) {
          const r = await showModal({ title: 'Your Excel file changed', message: 'Someone saved this file after the tool last opened or updated it. Updating replaces their changes with what is on screen. Choose Cancel, then Connect Excel file, to load their version instead.', confirmLabel: 'Update anyway', dangerConfirm: true })
          if (r.buttonValue !== 'confirm') return
        }
      }
      const lost = await contentUpdateWouldRemove(handle, wb)
      if (lost.length) {
        const r = await showModal({ title: 'Update Excel will remove content', message: 'Your file has ' + lost.slice(0, 5).join(', ') + (lost.length > 5 ? ' and ' + (lost.length - 5) + ' more' : '') + ' that this tool does not keep. Updating replaces the file without it.', confirmLabel: 'Update anyway', dangerConfirm: true })
        if (r.buttonValue !== 'confirm') return
      }
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const writable = await handle.createWritable()
      await writable.write(buf)
      await writable.close()
      fileHandle = handle
      persistFileHandle(handle)
      try { rememberFileStamp((await handle.getFile()).lastModified) } catch (e) { rememberFileStamp('') }
      if (changeCount === changesAtSnapshot) markSynced()
      showToast('Excel updated in place')
      setSyncState('ok', 'Excel updated at ' + new Date().toLocaleTimeString())
      return
    } catch (e) {
      if (e && e.name === 'AbortError') return
      showToast('Could not write into your file (' + ((e && e.message) || 'unknown error') + '). Downloading a copy instead.')
    }
  }
  XLSX.writeFile(wb, exportFileName())
  if (changeCount === changesAtSnapshot) markSynced()
  showToast('Excel downloaded — replace your working copy with this file')
}

// True when it is fine to replace the working state: nothing is unsaved, or the person agrees to lose it.
async function confirmReplaceUnsavedEdits(what) {
  flushPendingSaves() // an edit blurred a moment ago counts as unsaved, and never lands in the next account
  if (!unsavedEdits) return true
  const r = await showModal({ title: 'Replace your unsaved edits?', message: 'You have edits that no Excel file has received yet. ' + what + ' replaces them.', confirmLabel: 'Replace', dangerConfirm: true })
  return r.buttonValue === 'confirm'
}

// Opens a picked or remembered file. Asks before replacing unsaved edits, says so when the file
// cannot be read, and ties Update Excel to the file just opened so it can never write into the
// previous account's file.
async function loadWorkbookFromFile(file, handle) {
  if (!(await confirmReplaceUnsavedEdits('Opening this file'))) return false
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
    // SheetJS reads plain text as a one-sheet table without failing, so check for the sheets
    // this tool writes before anything replaces the working state.
    const known = wb.SheetNames.some(n => SHEET_BASES.includes(n))
    if (!known) { showToast('That file has none of the sheets this tool uses, so nothing was imported.'); return false }
    fileHandle = null // never point Update Excel at the previous account's file while this one loads
    importWorkbook(wb, file.name)
  } catch (e) {
    showToast('Could not read that file. Choose an .xlsx workbook.')
    return false
  }
  fileHandle = handle || null
  rememberFileStamp(handle ? file.lastModified : '')
  if (handle) persistFileHandle(handle); else forgetPersistedFileHandle()
  return true
}

// Remembered-file convenience (Chrome/Edge only — the File System Access API doesn't
// exist elsewhere). A FileSystemFileHandle is structured-clone-able, so it can be stored
// in IndexedDB directly, no manual serialization. Best-effort throughout — any failure
// here just means the tool falls back to a normal manual Import, never a hard error.
const HANDLE_DB_NAME = 'accountPlanningToolFiles'
const HANDLE_STORE = 'handles'
const HANDLE_KEY = 'primary'

let handleDb = null // one connection, opened on first use
function openHandleDb() {
  if (handleDb) return handleDb
  return handleDb = new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('no indexedDB')); return }
    const req = indexedDB.open(HANDLE_DB_NAME, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(HANDLE_STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => { handleDb = null; reject(req.error) }
  })
}

// One transaction on the handle store; run() returns the request whose result to hand back.
async function withHandleStore(mode, run) {
  const db = await openHandleDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, mode)
    const req = run(tx.objectStore(HANDLE_STORE))
    tx.oncomplete = () => resolve(req.result)
    tx.onerror = () => reject(tx.error)
  })
}

// All three are best effort: a failure only means no remembered file next time.
async function persistFileHandle(handle) {
  try { await withHandleStore('readwrite', store => store.put(handle, HANDLE_KEY)) } catch (e) { /* non-fatal */ }
}

async function getPersistedFileHandle() {
  try { return (await withHandleStore('readonly', store => store.get(HANDLE_KEY))) || null } catch (e) { return null }
}

async function forgetPersistedFileHandle() {
  try { await withHandleStore('readwrite', store => store.delete(HANDLE_KEY)) } catch (e) { /* ignore */ }
}

// Reads and imports a remembered handle's file. Caller decides whether it's safe to call
// requestPermission() (needs a real user gesture in most browsers) via the askIfNeeded flag.
async function reacquireRememberedFile(askIfNeeded) {
  if (!window.showSaveFilePicker) return 'unsupported'
  const handle = await getPersistedFileHandle()
  if (!handle) return 'none'
  try {
    let perm = await handle.queryPermission({ mode: 'readwrite' })
    if (perm !== 'granted' && askIfNeeded) perm = await handle.requestPermission({ mode: 'readwrite' })
    if (perm !== 'granted') return 'needs-permission'
    // Edits made after the last Update Excel live only in the browser. Loading the file
    // now would silently replace them, so keep them and just reconnect the file.
    if (unsavedEdits) { fileHandle = handle; return 'kept-local' }
    const ok = await loadWorkbookFromFile(await handle.getFile(), handle)
    return ok ? 'ok' : 'error'
  } catch (e) {
    if (e && e.name === 'NotFoundError') forgetPersistedFileHandle() // moved or deleted: stop offering it
    return 'error'
  }
}
