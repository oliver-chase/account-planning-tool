'use strict';
// Small DOM helpers: element, button and SVG builders, chips, toasts, modals, downloads and the editable field.

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
    t.appendChild(buttonEl('app-toast-undo', actionLabel, () => { clearTimeout(timer); t.remove(); actionFn() }))
  }
  container.appendChild(t)
  timer = setTimeout(() => t.remove(), actionLabel ? 6000 : 3000)
}

// A button that never submits a form, with an optional click handler.
function buttonEl(className, text, onClick) {
  const b = el('button', className, text)
  b.type = 'button'
  if (onClick) b.addEventListener('click', onClick)
  return b
}

// An SVG element with its attributes and optional text.
function svgEl(tag, attrs, text) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag)
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v)))
  if (text != null) n.textContent = text
  return n
}

function emptyResultsBox(text) {
  return el('div', 'module-empty-state', text)
}

function inlineActionButton(label, onClick, opts) {
  const b = buttonEl('inline-action-button btn-link', null, onClick)
  b.appendChild(el('span', 'inline-action-button-label', label))
  if (opts && opts.id) b.id = opts.id
  return b
}

function compactRemoveButton(title, onClick, extraClass) {
  const b = buttonEl('account-card-remove-btn' + (extraClass ? ' ' + extraClass : ''), '×', e => { e.stopPropagation(); onClick(e) })
  b.title = title
  b.setAttribute('aria-label', title)
  return b
}

function appChip(label, onRemove) {
  const chip = el('span', 'app-chip', null)
  chip.appendChild(el('span', null, label))
  const rm = buttonEl('app-chip-remove', '×', onRemove)
  rm.setAttribute('aria-label', 'Remove ' + label)
  chip.appendChild(rm)
  return chip
}

// Saves text as a file through a temporary link.
function downloadText(text, fileName, type) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = fileName
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function downloadHtml(html, fileName) { downloadText(html, fileName, 'text/html') }

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

// Asks first, with the Delete button styled as dangerous, and runs onConfirm only on a yes.
function confirmDelete(title, message, onConfirm) {
  showModal({ title, message, confirmLabel: 'Delete', dangerConfirm: true }).then(r => { if (r.buttonValue === 'confirm') onConfirm() })
}

// Removes an item from state[listKey] straight away and offers Undo, so a stray tap on a
// live call costs nothing. Undo puts the item back where it was.
function deleteWithUndo(listKey, item, label, rerender) {
  const idx = state[listKey].findIndex(x => x.id === item.id)
  if (idx < 0) return
  state[listKey].splice(idx, 1)
  persist(); rerender()
  const owner = state // loading another workbook replaces state, and Undo must not put the item into it
  showToast(label + ' deleted', 'Undo', () => {
    if (state !== owner || state[listKey].some(x => x.id === item.id)) return
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

// Closing the page saves what is waiting. A field that still has focus is blurred first, since
// browsers do not reliably fire blur on close and the field queues its save on blur.
window.addEventListener('pagehide', () => {
  const active = document.activeElement
  if (active && active !== document.body && active.blur) active.blur()
  flushPendingSaves()
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; writeLocalNow() }
})

// contentEditable helper: value + debounced-save-on-blur, Enter blurs, Escape reverts.
function editable(tag, className, value, placeholder, onSave, opts) {
  opts = opts || {}
  const node = el(tag, className + (opts.multiline ? ' editable-multiline' : ''), null)
  node.setAttribute('contenteditable', 'true') // the attribute, so selectors and test DOMs see it too
  node.setAttribute('role', 'textbox')
  // An empty field has no text to read, so fall back to its placeholder as the name.
  const accName = opts.ariaLabel || (placeholder || '').replace(/[….]+$/, '').replace(/^e\.g\. /, '')
  if (accName) node.setAttribute('aria-label', accName)
  if (placeholder) { node.setAttribute('data-placeholder', placeholder); node.setAttribute('aria-placeholder', placeholder) }
  node.textContent = value || ''
  const saver = queuedSaver(300)
  node.addEventListener('blur', () => {
    // innerText keeps the line breaks typed with Enter; textContent drops them.
    const v = String(opts.multiline && node.innerText != null ? node.innerText : node.textContent).trim()
    if (!v && opts.revertOnEmpty) { node.textContent = value || ''; return }
    // Clicking into a field and out again changes nothing. New-item cards opt out, because
    // an empty blur is how they decide to discard themselves.
    if (!opts.alwaysSave && v === (value || '').trim()) { saver.cancel(); return } // an earlier blur's queued save no longer applies
    saver.queue(() => onSave(v))
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
    const closeBtn = buttonEl('app-modal-close', '×', () => close('cancel'))
    closeBtn.setAttribute('aria-label', 'Close')
    modal.appendChild(closeBtn)
    let confirmBtn, cancelBtn
    if (!opts.hideActions) {
      const actions = el('div', 'app-modal-actions', null)
      cancelBtn = buttonEl('btn btn-ghost', 'Cancel', () => close('cancel'))
      confirmBtn = buttonEl('btn ' + (opts.dangerConfirm ? 'btn-danger' : 'btn-primary'), opts.confirmLabel || 'OK', () => close('confirm'))
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
