'use strict';
// Small DOM helpers: element builder, buttons, chips, toasts, modals and the popover pickers.

function el(tag, className, text) {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text != null) e.textContent = text
  // Section titles are headings, so a screen reader can jump between sections.
  if (className && /(^| )app-section-title( |$)/.test(className)) { e.setAttribute('role', 'heading'); e.setAttribute('aria-level', '2') }
  return e
}

function showToast(msg, actionLabel, actionFn) {
  const container = document.getElementById('toast-container')
  const t = el('div', 'app-toast', null)
  t.appendChild(el('span', null, msg))
  let timer
  if (actionLabel && actionFn) {
    const btn = el('button', 'app-toast-undo', actionLabel)
    btn.type = 'button'
    btn.addEventListener('click', () => { clearTimeout(timer); t.remove(); actionFn() })
    t.appendChild(btn)
  }
  container.appendChild(t)
  timer = setTimeout(() => t.remove(), actionLabel ? 6000 : 3000)
}

function emptyResultsBox(text) {
  return el('div', 'module-empty-state', text)
}

function inlineActionButton(label, onClick, opts) {
  const b = el('button', 'inline-action-button btn-link', null)
  b.type = 'button'
  b.appendChild(el('span', 'inline-action-button-label', label))
  if (opts && opts.id) b.id = opts.id
  b.addEventListener('click', onClick)
  return b
}

function compactRemoveButton(title, onClick, extraClass) {
  const b = el('button', 'account-card-remove-btn' + (extraClass ? ' ' + extraClass : ''), '×')
  b.type = 'button'
  b.title = title
  b.setAttribute('aria-label', title)
  b.addEventListener('click', e => { e.stopPropagation(); onClick(e) })
  return b
}

function appChip(label, onRemove) {
  const chip = el('span', 'app-chip', null)
  chip.appendChild(el('span', null, label))
  const rm = el('button', 'app-chip-remove', '×')
  rm.type = 'button'
  rm.setAttribute('aria-label', 'Remove ' + label)
  rm.addEventListener('click', onRemove)
  chip.appendChild(rm)
  return chip
}

// Saves an HTML string as a file through a temporary link.
function downloadHtml(html, fileName) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  const a = document.createElement('a')
  a.href = url; a.download = fileName
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Makes a clickable element reachable and operable from the keyboard: it joins the tab
// order and Enter or Space does what a click does. Only the element's own key presses count,
// so typing inside a field within it is left alone.
function makeActivatable(node, label, onActivate) {
  node.tabIndex = 0
  if (label) node.setAttribute('aria-label', label)
  node.addEventListener('keydown', e => {
    if (e.target !== node || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    onActivate(e)
  })
  return node
}

// Removes an item from state[listKey] straight away and offers Undo, so a stray tap on a
// live call costs nothing. Undo puts the item back where it was.
function deleteWithUndo(listKey, item, label, rerender) {
  const idx = state[listKey].findIndex(x => x.id === item.id)
  if (idx < 0) return
  state[listKey].splice(idx, 1)
  persist(); rerender()
  showToast(label + ' deleted', 'Undo', () => {
    if (state[listKey].some(x => x.id === item.id)) return
    state[listKey].splice(Math.min(idx, state[listKey].length), 0, item)
    persist(); renderAll()
  })
}

// A new-item card keeps itself alive while the user is still working in it: focus inside
// the card, or a picker open, means a blur on the empty title is not a reason to throw it away.
function newCardInUse(card) {
  return card.contains(document.activeElement) || !!document.querySelector('.app-popover')
}

// Rebuilds a section and puts keyboard focus back on the control that had it, found by its data-fk key.
function renderKeepingFocus(rootId, body) {
  const FOCUSABLE = 'button, input, select, textarea, [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
  const root = document.getElementById(rootId)
  const a = document.activeElement
  const key = a && a.dataset ? a.dataset.fk : ''
  // A control with no key is found again by its position among the section's focusable controls.
  const index = root && a && !key && root.contains(a) ? [...root.querySelectorAll(FOCUSABLE)].indexOf(a) : -1
  // Text typed into a field that is not saved yet moves to the rebuilt copy of that field.
  const live = a && a.isContentEditable && index >= 0 ? (a.innerText !== undefined ? a.innerText : a.textContent) : null
  body()
  const after = document.getElementById(rootId)
  if (!after) return
  let n = key ? after.querySelector('[data-fk="' + key.replace(/(["\\])/g, '\\$1') + '"]') : index >= 0 ? after.querySelectorAll(FOCUSABLE)[index] : null
  if (n && n.disabled) n = after.querySelector('[data-fk="pg-Previous"]') // a pager button that just disabled itself
  if (!n || !n.focus) return
  if (live !== null && n.isContentEditable && (n.innerText !== undefined ? n.innerText : n.textContent) !== live) {
    n.textContent = live
    const sel = window.getSelection && window.getSelection()
    if (sel && document.createRange) { const r = document.createRange(); r.selectNodeContents(n); r.collapse(false); sel.removeAllRanges(); sel.addRange(r) }
  }
  n.focus()
}

window.addEventListener('pagehide', () => {
  ;[...pendingEditSaves].forEach(run => run())
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; writeLocalNow() }
})

// contentEditable helper: value + debounced-save-on-blur, Enter blurs, Escape reverts.
function editable(tag, className, value, placeholder, onSave, opts) {
  opts = opts || {}
  const node = el(tag, className + (opts.multiline ? ' editable-multiline' : ''), null)
  node.contentEditable = 'true'
  node.setAttribute('role', 'textbox')
  // An empty field has no text to read, so fall back to its placeholder as the name.
  const accName = opts.ariaLabel || (placeholder || '').replace(/[….]+$/, '').replace(/^e\.g\. /, '')
  if (accName) node.setAttribute('aria-label', accName)
  if (placeholder) { node.setAttribute('data-placeholder', placeholder); node.setAttribute('aria-placeholder', placeholder) }
  node.textContent = value || ''
  let timer = null, pending = null
  node.addEventListener('blur', () => {
    // innerText keeps the line breaks typed with Enter; textContent drops them.
    const v = (opts.multiline ? node.innerText : node.textContent).trim()
    if (!v && opts.revertOnEmpty) { node.textContent = value || ''; return }
    // Clicking into a field and out again changes nothing. New-item cards opt out, because
    // an empty blur is how they decide to discard themselves.
    if (!opts.alwaysSave && v === (value || '').trim()) { clearTimeout(timer); pendingEditSaves.delete(pending); return } // an earlier blur's queued save no longer applies
    clearTimeout(timer)
    pendingEditSaves.delete(pending)
    pending = () => { clearTimeout(timer); pendingEditSaves.delete(pending); onSave(v) }
    pendingEditSaves.add(pending)
    timer = setTimeout(pending, 300)
  })
  node.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !opts.multiline) { e.preventDefault(); node.blur() }
    if (e.key === 'Escape') { node.textContent = value || ''; node.blur() }
  })
  return node
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true }
  } catch (e) { /* fall through */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text; ta.setAttribute('readonly', 'true'); ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.focus(); ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch (e) { return false }
}

// ---- Modal dialog: confirm and custom content ----
// opts.bodyBuilder(body, close) hands the caller the body element, for content the message
// and input fields cannot express (checkbox lists, a scrollable sub-list). opts.hideActions
// skips the default Cancel and Confirm row for callers, like Export, that supply their own
// action button inside bodyBuilder.
function showModal(opts) {
  return new Promise(resolve => {
    const root = document.getElementById('modal-root')
    const overlay = el('div', 'app-modal-overlay', null)
    const modal = el('div', 'app-modal' + (opts.dangerConfirm || opts.bodyBuilder ? ' app-modal-lg' : ''), null)
    const title = el('h3', 'app-modal-title', opts.title || '')
    title.id = 'modal-title-' + Math.random().toString(36).slice(2, 8)
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', title.id)
    const opener = document.activeElement // focus returns here when the dialog closes
    const body = el('div', 'app-modal-body', null)
    if (opts.message) { const msgEl = el('p', null, opts.message); msgEl.style.whiteSpace = 'pre-wrap'; body.appendChild(msgEl) }
    function close(buttonValue) {
      overlay.remove()
      document.removeEventListener('keydown', onEsc)
      if (opener && opener.focus && document.contains(opener)) opener.focus()
      resolve({ buttonValue })
    }
    if (opts.bodyBuilder) opts.bodyBuilder(body, () => close('confirm'))
    const closeBtn = el('button', 'app-modal-close', '×')
    closeBtn.type = 'button'; closeBtn.setAttribute('aria-label', 'Close')
    closeBtn.addEventListener('click', () => close('cancel'))
    modal.appendChild(closeBtn)
    let confirmBtn, cancelBtn
    if (!opts.hideActions) {
      const actions = el('div', 'app-modal-actions', null)
      cancelBtn = el('button', 'btn btn-ghost', 'Cancel')
      cancelBtn.type = 'button'
      confirmBtn = el('button', 'btn ' + (opts.dangerConfirm ? 'btn-danger' : 'btn-primary'), opts.confirmLabel || 'OK')
      confirmBtn.type = 'button'
      cancelBtn.addEventListener('click', () => close('cancel'))
      confirmBtn.addEventListener('click', () => close('confirm'))
      actions.appendChild(cancelBtn); actions.appendChild(confirmBtn)
      modal.appendChild(title); modal.appendChild(body); modal.appendChild(actions)
    } else {
      modal.appendChild(title); modal.appendChild(body)
    }
    overlay.addEventListener('click', e => { if (e.target === overlay) close('cancel') })
    // Escape closes, and Tab stays inside the dialog.
    const onEsc = e => {
      if (e.key === 'Escape') { close('cancel'); return }
      if (e.key !== 'Tab') return
      const f = [...modal.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null)
      if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onEsc)
    overlay.appendChild(modal)
    root.appendChild(overlay)
    ;((opts.dangerConfirm && cancelBtn) || confirmBtn || closeBtn).focus() // a destructive dialog starts on Cancel
  })
}
