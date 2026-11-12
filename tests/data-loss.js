'use strict'
// Guards against losing or misdirecting the user's edits.
// Run: node tests/data-loss.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert')
const root = path.join(__dirname, '..')
const XLSX = require(path.join(root, 'js/xlsx.full.min.js'))

function workbookBuffer(name) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Field', 'Value'], ['Account Name', name]]), 'Overview')
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
}
const fileOf = (name, buf) => ({ name, arrayBuffer: async () => buf })

const store = { 'accountPlanningTool.state.v2': JSON.stringify({ account: { account_name: 'Old' } }) } // an older save with no plans or sections
const toasts = []
let modalAnswer = 'confirm'
const sandbox = {
  console, process, TextEncoder, XLSX, assert, workbookBuffer, fileOf, toasts, setTimeout, clearTimeout,
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v) } },
  document: { getElementById: () => null },
  window: { addEventListener() {}, showSaveFilePicker() {} },
  renderAll() {}, showToast: m => toasts.push(m), showModal: async () => ({ buttonValue: modalAnswer }),
  persistFileHandle() {}, forgetPersistedFileHandle() {}, resetOverviewCadenceUI() {},
  setModal: v => { modalAnswer = v },
}
const src = ['js/state.js', 'js/excel.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n') + `
;(async () => {
  // A saved state from an older build still renders: missing sections are filled in.
  assert.strictEqual(state.account.account_name, 'Old')
  assert.ok(Array.isArray(state.plans) && Array.isArray(state.stakeholders), 'missing sections are filled in')

  // Importing account B must not leave Update Excel pointed at account A's file.
  fileHandle = { name: 'account-a.xlsx' }
  assert.ok(await loadWorkbookFromFile(fileOf('b.xlsx', workbookBuffer('B')), null))
  assert.strictEqual(state.account.account_name, 'B')
  assert.strictEqual(fileHandle, null, 'the previous account file is released')

  // Unsaved edits are not replaced unless the user agrees.
  persist()
  assert.strictEqual(unsavedEdits, true)
  setModal('cancel')
  assert.strictEqual(await loadWorkbookFromFile(fileOf('c.xlsx', workbookBuffer('C')), null), false)
  assert.strictEqual(state.account.account_name, 'B', 'edits kept after the user declines')
  setModal('confirm')
  assert.ok(await loadWorkbookFromFile(fileOf('c.xlsx', workbookBuffer('C')), null))
  assert.strictEqual(state.account.account_name, 'C')
  assert.strictEqual(unsavedEdits, false, 'importing marks the state as matching the file')

  // A file that cannot be read says so and changes nothing.
  toasts.length = 0
  const keep = state
  assert.strictEqual(await loadWorkbookFromFile(fileOf('bad.xlsx', new TextEncoder().encode('not a workbook').buffer), null), false)
  assert.strictEqual(state, keep)
  assert.ok(toasts.length > 0, 'the user is told')

  // Reconnecting a remembered file on load keeps newer unsaved edits.
  state.account.account_name = 'Typed after last save'
  persist()
  getPersistedFileHandle = async () => ({ queryPermission: async () => 'granted', getFile: async () => fileOf('a.xlsx', workbookBuffer('From file')) })
  assert.strictEqual(await reacquireRememberedFile(false), 'kept-local')
  assert.strictEqual(state.account.account_name, 'Typed after last save', 'unsaved edits survive the reconnect')
  markSynced()
  assert.strictEqual(await reacquireRememberedFile(false), 'ok')
  assert.strictEqual(state.account.account_name, 'From file', 'with nothing unsaved, the file loads')
  // A failed import leaves no stale file handle behind.
  fileHandle = { name: 'previous-account.xlsx' }
  const realRenderAll = renderAll
  renderAll = () => { throw new Error('render failed') }
  assert.strictEqual(await loadWorkbookFromFile(fileOf('d.xlsx', workbookBuffer('D')), null), false)
  renderAll = realRenderAll
  assert.strictEqual(fileHandle, null, 'Update Excel is not left pointing at the previous account file')

  // Update Excel names what it would remove from the file and writes only after a yes.
  const extra = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(extra, XLSX.utils.aoa_to_sheet([['Field', 'Value'], ['Account Name', 'X']]), 'Overview')
  XLSX.utils.book_append_sheet(extra, XLSX.utils.aoa_to_sheet([['Name'], ['Ada']]), 'Contacts')
  const extraBuf = XLSX.write(extra, { bookType: 'xlsx', type: 'array' })
  let wrote = false
  fileHandle = { getFile: async () => fileOf('x.xlsx', extraBuf), createWritable: async () => ({ write: async () => { wrote = true }, close: async () => {} }) }
  setModal('cancel')
  await updateExcel()
  assert.strictEqual(wrote, false, 'declining the warning writes nothing')
  setModal('confirm')
  await updateExcel()
  assert.strictEqual(wrote, true, 'agreeing writes the file')

  // An edit made while Update Excel is writing is not in the file, so the state stays unsaved.
  state.account.account_name = 'Saved'
  markSynced()
  fileHandle = { createWritable: async () => ({ write: async () => { persist() }, close: async () => {} }) }
  await updateExcel()
  assert.strictEqual(unsavedEdits, true, 'an edit during the save keeps the unsaved flag')
  fileHandle = { createWritable: async () => ({ write: async () => {}, close: async () => {} }) }
  await updateExcel()
  assert.strictEqual(unsavedEdits, false, 'a clean save marks the state saved')
  // A save still waiting on its timer runs before Update Excel reads the state.
  let ranFirst = false
  pendingEditSaves.add(() => { ranFirst = true; pendingEditSaves.clear() })
  fileHandle = { createWritable: async () => ({ write: async () => {}, close: async () => {} }) }
  await updateExcel()
  assert.ok(ranFirst, 'a waiting save runs before the workbook is built')
  // A save still waiting from the previous account lands before a new file replaces the state,
  // so it is asked about and never written into the account that opens next.
  markSynced()
  pendingEditSaves.add(function run() { pendingEditSaves.delete(run); state.account.account_name = 'Typed late'; persist() })
  setModal('cancel')
  assert.strictEqual(await loadWorkbookFromFile(fileOf('next.xlsx', workbookBuffer('Next')), null), false, 'the late edit counts as unsaved, so Cancel keeps it')
  assert.strictEqual(state.account.account_name, 'Typed late')
  setModal('confirm')
  await loadWorkbookFromFile(fileOf('next.xlsx', workbookBuffer('Next')), null)
  assert.strictEqual(state.account.account_name, 'Next')
  console.log('data-loss: ok')
})().catch(e => { console.error(e); process.exit(1) })
`
vm.runInNewContext(src, sandbox)

// An autosave that cannot be read is kept aside before the next save writes over it.
const broken = { 'accountPlanningTool.state.v2': '{not json' }
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/state.js'), 'utf8'), { ...sandbox, localStorage: { getItem: k => (k in broken ? broken[k] : null), setItem: (k, v) => { broken[k] = String(v) } } })
assert.strictEqual(broken['accountPlanningTool.state.v2.corrupt'], '{not json')
