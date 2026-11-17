'use strict';
// Data model: Account, Background, Stakeholder, Action, Note and Plan.
// One workbook is one account.

// A new person with the fields every card expects.
function newPerson(name, title) {
  return { id: uid('p'), name: name || '', title: title || '', department: '', organization: 'Client', is_executive: 'false', sentiment: 'Unknown', worker_type: 'Client Employee', primary_owner: '', secondary_owner: '', reports_to: '', engagement: '', notes: '', created_date: today(), last_updated: today() }
}

// A new record of each kind, with every field its screen reads.
function newAction() { return { id: uid('act'), description: '', owner: '', engagement: '', status: 'Open', due_date: '', closed_date: '', created_date: today(), last_updated: today() } }
function newNote() { return { id: uid('note'), date: today(), type: 'Meeting', title: '', attendees: [], body: '', transcript_link: '', created_date: today(), last_updated: today() } }
function newPlan() { return { id: uid('plan'), year: String(new Date().getFullYear()), objective: '', revenue_target: '', strategy: '', risks_summary: '', last_reviewed_at: '', next_review_at: '' } }

function uid(prefix) { return prefix + '-' + Math.random().toString(36).slice(2, 10) }
// Dates are kept as local calendar days (YYYY-MM-DD). toISOString() would give the UTC day,
// which is already tomorrow in the evening west of UTC and still yesterday early east of it.
function localISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
function today() { return localISO(new Date()) }
function isoPlusDays(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return localISO(d) }
// Adds calendar months and clamps the day, so 31 Jan plus a month is the last day of February.
function isoPlusMonths(iso, n) {
  const [y, m, day] = iso.split('-').map(Number)
  const target = new Date(y, m - 1 + n, 1)
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(day, last))
  return localISO(target)
}

// "$450K" is 450000, "$1.2M" is 1200000, "1,200,000" is 1200000. Of several numbers the one with a $ wins,
// then the one with a unit, then the first. A range like "450-500K" shares its unit. Unreadable is 0.
const MONEY_UNITS = { bil: 1e9, mil: 1e6, k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, mill: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 }
function parseMoney(s) {
  const text = String(s == null ? '' : s).toLowerCase()
  const found = [...text.matchAll(/(\$)?\s*(\d{1,3}(?: \d{3})+(?:\.\d+)?|[\d,]*\.?\d+)\s*(thousand|million|billion|mill|mil|bil|bn|mm|k|m|b)?s?\b/g)]
  if (!found.length) return 0
  const rangeUnit = k => {
    const next = found[k + 1], m = found[k]
    return !m[3] && next && next[3] && /^\s*(-|to|\u2013)\s*\$?\s*$/.test(text.slice(m.index + m[0].length, next.index)) ? next[3] : ''
  }
  let i = found.findIndex(m => m[1])
  if (i < 0) i = found.findIndex((m, k) => rangeUnit(k))
  if (i < 0) i = found.findIndex(m => m[3])
  if (i < 0) i = 0
  const m = found[i]
  const unit = m[3] || rangeUnit(i)
  const n = parseFloat(m[2].replace(/[, ]/g, ''))
  return isFinite(n) ? n * (MONEY_UNITS[unit] || 1) : 0
}

// Higher seniority sorts first: chief, then SVP, VP, director, manager, everyone else.
function titleRank(title) {
  const t = (title || '').toLowerCase()
  if (/\b(evp|svp|executive vice president|(senior|sr\.?) vice president)\b/.test(t)) return 2
  if (/\bassistant\b/.test(t)) return 6 // an assistant to an executive holds an assistant's role
  if (/\bvp\b|vice president/.test(t)) return 3
  if (/\b(ceo|cfo|cto|coo|cio|ciso|cmo|cro|president|founder|chief)\b|\bbusiness owner\b/.test(t)) return 1
  if (/\bdirector\b/.test(t)) return 4
  if (/\bmanager\b/.test(t)) return 5
  if (title) return 6
  return 7
}

function emptyState() {
  return {
    account: { account_name: '', client_company: '', status: 'Active', created_date: today(), last_updated: today() },
    background: {
      account_director: '', account_manager: '', account_team: '',
      meeting_title: '', meeting_frequency: '', meeting_day: '', meeting_interval: '1',
      meeting_attendees: '', next_meeting_override: '',
      account_tier: 'Growth', strategic_context: '',
      revenue: {}, last_updated: today(),
    },
    stakeholders: [],
    actions: [],
    notes: [],
    plans: [],
    meta: { sourceFileName: '' },
  }
}

const STORAGE_KEY = 'accountPlanningTool.state.v2'
// The last autosave when it could not be read, so the page can say why it started empty and offer the copy.
let unreadableAutosave = null
let unreadableAutosaveKept = false
// An autosave that cannot be read is kept under its own key before the next save writes over it.
let state = (() => {
  let raw = null
  try { raw = localStorage.getItem(STORAGE_KEY); return raw ? mergeStored(JSON.parse(raw)) : null } catch (e) {
    unreadableAutosave = raw
    try { if (raw) { localStorage.setItem(STORAGE_KEY + '.corrupt', raw); unreadableAutosaveKept = true } } catch (e2) { /* storage is full or unavailable */ }
    return null
  }
})() || emptyState()
let fileHandle = null // File System Access API handle, set once Update Excel picks a target

// A reporting loop (A reports to B, B to A) cannot be drawn. Cut each loop where it closes,
// at the person whose boss leads back to them. Returns how many lines were cut.
function breakReportingCycles(people) {
  let cut = 0
  people.forEach(p => { if (isDescendantOf(p.id, p.id, people)) { p.reports_to = ''; cut++ } })
  return cut
}

// Fills in anything an older or partial saved state lacks, so a missing section or a missing
// field never blanks the page. An entry that is not a record is dropped.
function mergeStored(stored) {
  if (!stored || typeof stored !== 'object') return null
  const base = emptyState()
  const out = { ...base, ...stored }
  ;['account', 'background', 'meta'].forEach(k => { out[k] = { ...base[k], ...(stored[k] || {}) } })
  const blank = { stakeholders: newPerson, actions: newAction, notes: newNote, plans: newPlan }
  Object.keys(blank).forEach(k => { out[k] = (Array.isArray(stored[k]) ? stored[k] : []).filter(r => r && typeof r === 'object').map(r => ({ ...blank[k](), ...r })) })
  return out
}

// True while the browser holds edits that no Excel file has received yet. Kept in
// localStorage so a reload remembers it.
const UNSYNCED_KEY = STORAGE_KEY + '.unsynced'
// The modified time of the connected file when this tool last read or wrote it, so Update Excel
// can tell when someone saved the file in Excel since.
const FILE_STAMP_KEY = STORAGE_KEY + '.fileStamp'
function rememberFileStamp(ms) { try { localStorage.setItem(FILE_STAMP_KEY, ms ? String(ms) : '') } catch (e) { /* non-fatal */ } }
function fileStamp() { try { return localStorage.getItem(FILE_STAMP_KEY) || '' } catch (e) { return '' } }
let unsavedEdits = (() => { try { return localStorage.getItem(UNSYNCED_KEY) === '1' } catch (e) { return false } })()

function writeLocalNow() {
  persistTimer = null // a closing page must not write again after the timer has fired
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    localStorage.setItem(UNSYNCED_KEY, unsavedEdits ? '1' : '0')
    setSyncState('ok', 'Saved in this browser at ' + new Date().toLocaleTimeString())
  } catch (e) { setSyncState('error', 'Local save failed') }
}

// Saves queued through queuedSaver() that have not run yet, so Update Excel and closing
// the page can run them first.
const pendingEditSaves = new Set()
function flushPendingSaves() { [...pendingEditSaves].forEach(run => run()) }
// One field's waiting save: queue(fn) replaces the save still waiting and runs fn after ms, unless a flush runs it first.
function queuedSaver(ms) {
  let timer = null, run = null
  const cancel = () => { clearTimeout(timer); pendingEditSaves.delete(run) }
  const queue = fn => { cancel(); run = () => { cancel(); fn() }; pendingEditSaves.add(run); timer = setTimeout(run, ms) }
  return { queue, cancel, pending: () => pendingEditSaves.has(run) }
}
// The columns of each sheet, shared by the export and the starter workbook. Import reads columns by name.
// ReportsTo is the name people edit; ReportsToID tells two people with one name apart (see parseStateFromRows).
const SHEET_HEADERS = {
  People: ['ID', 'Name', 'Title', 'Department', 'Organization', 'IsExecutive', 'Sentiment', 'WorkerType', 'PrimaryOwner', 'SecondaryOwner', 'ReportsTo', 'ReportsToID', 'Engagement', 'Notes'],
  Actions: ['ID', 'Description', 'Owner', 'Engagement', 'Status', 'DueDate', 'ClosedDate', 'CreatedDate'],
  Notes: ['ID', 'Date', 'Type', 'Title', 'Attendees', 'Body', 'TranscriptLink', 'CreatedDate'],
  Plans: ['ID', 'Year', 'Objective', 'RevenueTarget', 'Strategy', 'RisksSummary', 'LastReviewedAt', 'NextReviewAt'],
}
// One sheet row from an object keyed by column name.
const sheetRow = (sheet, values) => SHEET_HEADERS[sheet].map(h => values[h] || '')
// Stamps a record, puts it back in state[listKey] by id and saves.
function saveRecord(listKey, rec) {
  rec.last_updated = today()
  const i = state[listKey].findIndex(x => x.id === rec.id)
  if (i < 0) return // the record was removed meanwhile, so there is nothing to save
  state[listKey][i] = rec
  persist()
}
// True, with a toast, when making parentId the manager of personId would loop.
function reportsToCycle(parentId, personId) {
  if (!parentId) return false
  if (parentId !== personId && !isDescendantOf(parentId, personId, state.stakeholders)) return false
  showToast('Cannot create circular reporting relationship')
  return true
}
let persistTimer = null
let changeCount = 0 // counts persist() calls so a save can tell whether anything changed while it ran
function persist() {
  unsavedEdits = true
  changeCount++
  clearTimeout(persistTimer)
  persistTimer = setTimeout(writeLocalNow, 200)
}

// Called after an Excel file has received, or just supplied, the current state.
function markSynced() {
  unsavedEdits = false
  try { localStorage.setItem(UNSYNCED_KEY, '0') } catch (e) { /* non-fatal */ }
}

function setSyncState(kind, text) {
  const dot = document.getElementById('sync-dot')
  const label = document.getElementById('sync-text')
  if (!dot || !label) return
  dot.classList.remove('syncing', 'error')
  if (kind === 'syncing') dot.classList.add('syncing')
  if (kind === 'error') dot.classList.add('error')
  label.textContent = text
}

function fmtDate(iso) {
  if (!iso) return ''
  const dt = new Date(iso + 'T00:00:00')
  if (isNaN(dt.getTime())) return iso
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Stored lists are joined with '; '. A cell with a semicolon splits on semicolons only, so a name can hold a
// comma; a cell without one splits on commas and line breaks.
const LIST_DELIM_RE = /[;,\n]/g

function toArray(val) {
  if (!val) return []
  if (Array.isArray(val)) return val
  const text = String(val)
  return text.split(text.includes(';') ? /[;\n]/ : LIST_DELIM_RE).map(s => s.trim()).filter(Boolean)
}

function getTeamNames(bg) {
  // Director and Manager each hold one name, which may contain a comma. The team list holds several.
  return [...new Set([sanitizeName(bg.account_director), sanitizeName(bg.account_manager), ...toArray(bg.account_team)].filter(Boolean))]
}

// A name in the internal-team pool lives in Director, Manager and the Account team list. This clears
// it from all three at once and returns a patch for saveBg(); it does not mutate bg.
function removeTeamMember(bg, name) {
  const patch = {}
  if (sanitizeName(bg.account_director) === name) patch.account_director = ''
  if (sanitizeName(bg.account_manager) === name) patch.account_manager = ''
  const team = toArray(bg.account_team)
  const filtered = team.filter(n => n !== name)
  if (filtered.length !== team.length) patch.account_team = filtered.join('; ')
  return patch
}

// Attendees can be internal team members or People records, so suggestions include both.
function allKnownNames(bg) {
  const set = new Set(getTeamNames(bg))
  state.stakeholders.forEach(s => { const n = sanitizeName(s.name); if (n) set.add(n) })
  return Array.from(set)
}

// A typed name never contains the delimiter that stored lists use, so it reads back as one name.
function sanitizeName(s) { return (s || '').replace(LIST_DELIM_RE, ' ').replace(/\s+/g, ' ').trim() }

function isDescendantOf(potentialDescendantId, potentialAncestorId, people) {
  const byId = {}; people.forEach(p => { byId[p.id] = p })
  let cur = byId[potentialDescendantId]
  const seen = {}
  while (cur && cur.reports_to) {
    if (cur.reports_to === potentialAncestorId) return true
    if (seen[cur.reports_to]) return false
    seen[cur.reports_to] = true
    cur = byId[cur.reports_to]
  }
  return false
}

function slugify(s) {
  return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'account-plan'
}
