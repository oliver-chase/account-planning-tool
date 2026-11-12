'use strict';
// Shell for the page: account header editing, the sidebar file-actions bar, nav active-state
// tracking, wireShell() (Import/Update/New Blank/Export/How-To/org-chart-resize wiring) and
// the remembered-file reconnect bootstrap. Loaded last in index.html, after app.js, which
// defines SECTIONS and renderAll().

const TIER_OPTS = [['Growth', 'Growth'], ['Strategic', 'Strategic'], ['Maintenance', 'Maintenance'], ['At-Risk', 'At-Risk']]

function renderNav() {
  const sideNav = document.getElementById('section-nav')
  sideNav.innerHTML = ''
  SECTIONS.forEach(([id, label]) => {
    const a = el('a', null, label); a.href = '#' + id
    sideNav.appendChild(a)
  })
}

function renderAccountHeader() {
  const nameEl = document.getElementById('account-name-heading')
  const companyEl = document.getElementById('account-client-company')
  const lastUpdatedEl = document.getElementById('page-last-updated')
  nameEl.textContent = state.account.account_name || ''
  companyEl.textContent = state.account.client_company || ''
  lastUpdatedEl.textContent = state.account.last_updated ? 'Last updated ' + fmtDate(state.account.last_updated) : ''
  const tierSlot = document.getElementById('account-tier-slot')
  if (!tierSlot) return
  tierSlot.innerHTML = ''
  tierSlot.appendChild(singleSelectEl(TIER_OPTS, state.background.account_tier || 'Growth', v => {
    state.background.account_tier = v; state.background.last_updated = today(); persist(); renderAccountHeader()
  }, 'card-owner-btn popover-trigger'))
}

function wireAccountHeader() {
  const nameEl = document.getElementById('account-name-heading')
  const companyEl = document.getElementById('account-client-company')
  // Header fields save after a short pause, and Update Excel and closing the page run a waiting save first.
  const headerSaver = field => {
    let timer = null, run = null
    return v => {
      clearTimeout(timer); pendingEditSaves.delete(run)
      run = () => { clearTimeout(timer); pendingEditSaves.delete(run); state.account[field] = v; state.account.last_updated = today(); persist(); renderAccountHeader() }
      pendingEditSaves.add(run)
      timer = setTimeout(run, 300)
    }
  }
  // The account name cannot be emptied; the company can.
  const wireField = (node, field, required) => {
    const save = headerSaver(field)
    node.addEventListener('blur', () => {
      const v = node.textContent.trim()
      if (!v && required) { node.textContent = state.account[field] || ''; return }
      if (v !== (state.account[field] || '')) save(v)
    })
    node.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); node.blur() } })
  }
  wireField(nameEl, 'account_name', true)
  wireField(companyEl, 'client_company', false)
}

// File actions live in the sidebar under their own Actions header, styled like the section
// links. The buttons are built once with fixed ids, so wireShell attaches its listeners once.
function renderFileActionsBar() {
  const bar = document.getElementById('file-actions-bar')
  bar.innerHTML = ''
  const buttons = [
    ['btn-import', 'Connect Excel file'],
    ['btn-update-excel', 'Update Excel'],
    ['btn-new-blank-workbook', 'New blank workbook'],
    ['btn-export-menu', 'Export'],
    ['btn-show-help', 'How-to guide'],
  ]
  buttons.forEach(([id, label]) => {
    const b = el('button', 'app-sidebar-item', label)
    b.type = 'button'
    b.id = id
    bar.appendChild(b)
  })
}

function updateActiveNav() {
  const hash = window.location.hash.replace('#', '') || 'overview'
  document.querySelectorAll('#section-nav a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === '#' + hash)
  })
}

function wireShell() {
  renderFileActionsBar()
  renderNav()
  wireAccountHeader()
  wireFilterbar()
  window.addEventListener('hashchange', updateActiveNav)

  const sidebar = document.getElementById('sidebar')
  const backdrop = document.getElementById('sidebar-backdrop')
  const hamburger = document.getElementById('btn-hamburger')
  // At 900 px and under the sidebar slides away; while it is away its links leave the tab order.
  const narrow = window.matchMedia('(max-width:900px)')
  const setSidebar = open => {
    sidebar.classList.toggle('open', open); backdrop.classList.toggle('open', open)
    hamburger.setAttribute('aria-expanded', String(open))
    sidebar.inert = narrow.matches && !open
  }
  hamburger.addEventListener('click', () => setSidebar(!sidebar.classList.contains('open')))
  backdrop.addEventListener('click', () => setSidebar(false))
  document.querySelectorAll('#section-nav a').forEach(a => a.addEventListener('click', () => setSidebar(false)))
  if (narrow.addEventListener) narrow.addEventListener('change', () => setSidebar(false))
  setSidebar(false)

  document.getElementById('btn-import').addEventListener('click', async () => {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'Excel workbook', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
        })
        await loadWorkbookFromFile(await handle.getFile(), handle)
        return
      } catch (e) {
        if (e && e.name === 'AbortError') return
        // The picker itself failed, so fall back to the plain <input type=file> picker
      }
    }
    document.getElementById('file-input').click()
  })
  document.getElementById('file-input').addEventListener('change', e => {
    const file = e.target.files[0]
    if (file) loadWorkbookFromFile(file, null)
    e.target.value = ''
  })
  document.getElementById('btn-update-excel').addEventListener('click', updateExcel)
  document.getElementById('btn-show-help').addEventListener('click', toggleHelp)
  document.getElementById('btn-export-menu').addEventListener('click', openExportMenu)
  document.getElementById('btn-new-blank-workbook').addEventListener('click', async () => {
    flushPendingSaves()
    const r = await showModal({ title: 'Start a blank workbook?', message: unsavedEdits ? 'Edits you have not saved to Excel will be deleted. Click Update Excel first to keep them.' : 'This replaces the account in this browser with a blank one.', confirmLabel: 'Start blank', dangerConfirm: unsavedEdits })
    if (r.buttonValue !== 'confirm') return
    state = emptyState(); fileHandle = null
    resetOverviewCadenceUI()
    forgetPersistedFileHandle()
    persist(); renderAll()
    setSyncState('ok', 'Blank workbook started')
  })

  window.addEventListener('resize', () => {
    const outer = document.querySelector('.org-chart-outer')
    const tree = document.querySelector('.org-tree')
    if (outer && tree) drawOrgLines(outer, tree)
  })
}

wireShell()
renderAll()
{
  const source = state.meta && state.meta.sourceFileName
  const hasData = state.account.account_name || state.stakeholders.length || state.actions.length || state.notes.length
  setSyncState(source || hasData ? 'ok' : 'idle', source ? 'Loaded from local autosave (' + source + ')' : hasData ? 'Loaded from local autosave' : 'No file imported yet')
}

// Remembered-file reconnect (Chrome/Edge only). Silent check first — queryPermission()
// needs no user gesture, and if it's already granted the file loads with zero clicks.
// requestPermission() does need a real gesture in most browsers, so that path only ever
// runs from the toast button below, never automatically on load.
;(async () => {
  const result = await reacquireRememberedFile(false)
  if (result === 'ok') { showToast('Reconnected to your account file'); return }
  if (result === 'kept-local') { showToast('Kept your unsaved edits from last time. Use Connect Excel file to replace them.'); return }
  if (result === 'error') { showToast('Could not open your account file. Use Connect Excel file.'); return }
  if (result === 'needs-permission') {
    showToast('Reconnect to your remembered account file?', 'Reconnect', async () => {
      const r = await reacquireRememberedFile(true)
      if (r === 'ok') showToast('Reconnected')
      else if (r === 'kept-local') showToast('Kept your unsaved edits. Use Connect Excel file to replace them.')
      else if (r !== 'none') showToast('Could not reconnect. Use Connect Excel file.')
    })
  }
})()
