'use strict';
// Popovers and the pickers built on them: people, multi-select and fixed lists.

// ---- Popover picker ----
// A bordered, shadowed list with a live search box, per-item hover and selected state and an
// inline "add new" row. A native <select> cannot draw those.
let openPopoverState = null // { el, cleanup } — only one popover open at a time app-wide

// Focus inside the popover goes back to its trigger, so a pick that rebuilds the section finds the rebuilt trigger.
function closeOpenPopover() {
  if (!openPopoverState) return
  const { el: pop, anchor } = openPopoverState
  const hadFocus = pop.contains(document.activeElement)
  openPopoverState.cleanup()
  openPopoverState = null
  pop.remove()
  if (hadFocus && anchor.isConnected) anchor.focus()
}

// Every focusable row inside a popover goes through this, so Tab, Shift+Tab and the arrow keys
// reach all of them. A plain clickable div with no tabindex is invisible to a keyboard user.
function focusableRow(rowEl, onActivate) {
  rowEl.setAttribute('role', 'option')
  rowEl.addEventListener('click', onActivate)
  rowEl.setAttribute('aria-selected', String(rowEl.classList.contains('selected')))
  return makeActivatable(rowEl, null, onActivate)
}

function openPopover(anchor, buildContent) {
  // A second click on the same trigger closes its popover.
  if (openPopoverState && openPopoverState.anchor === anchor) { closeOpenPopover(); return }
  closeOpenPopover()
  const pop = el('div', 'app-popover app-popover-float', null)
  // The popover can hold a search box and an add-new row beside its options, so it is a dialog and the option lists inside it are the listboxes.
  pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', anchor.getAttribute('aria-label') || anchor.textContent || 'Options')
  anchor.setAttribute('aria-haspopup', 'dialog'); anchor.setAttribute('aria-expanded', 'true')
  const rect = anchor.getBoundingClientRect()
  pop.style.top = Math.min(rect.bottom + 4, window.innerHeight - 120) + 'px'
  pop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 260)) + 'px'
  document.body.appendChild(pop)
  try {
    buildContent(pop, closeOpenPopover)
  } catch (e) {
    pop.remove(); anchor.setAttribute('aria-expanded', 'false')
    throw e
  }
  // The click that opened this popover has already fired its mousedown, so this listener only sees later
  // mousedowns and the popover does not close itself.
  const onDocMouseDown = e => { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closeOpenPopover() }
  const onKey = e => {
    if (e.key === 'Escape') { closeOpenPopover(); return }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    if (!pop.contains(document.activeElement)) return
    e.preventDefault()
    const focusables = Array.from(pop.querySelectorAll('input, [tabindex]')).filter(f => f.tabIndex >= 0)
    const idx = focusables.indexOf(document.activeElement)
    const next = e.key === 'ArrowDown' ? Math.min(idx + 1, focusables.length - 1) : Math.max(idx - 1, 0)
    if (focusables[next]) focusables[next].focus()
  }
  document.addEventListener('mousedown', onDocMouseDown)
  document.addEventListener('keydown', onKey)
  openPopoverState = { el: pop, anchor, cleanup: () => { document.removeEventListener('mousedown', onDocMouseDown); document.removeEventListener('keydown', onKey); anchor.setAttribute('aria-expanded', 'false') } }
  const search = pop.querySelector('.app-popover-search')
  const first = search || pop.querySelector('.selected[tabindex]') || pop.querySelector('[tabindex]') // a list with no search box takes focus on its selected or first row
  if (first) first.focus()
}

// "+ Add new…" turns into a text input in place: Enter submits, Escape or blur cancels.
function popoverAddNewRow(onSubmit) {
  let adding = false
  const row = el('div', 'app-popover-add-new', null)
  row.addEventListener('keydown', e => { if (!adding && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); adding = true; render() } })
  function render() {
    row.innerHTML = ''
    row.onclick = null
    if (!adding) {
      row.tabIndex = 0
      row.textContent = '+ Add new…'
      row.onclick = () => { adding = true; render() }
    } else {
      // The row itself drops out of tab order while showing the input -- otherwise Tab
      // would stop on both the (now-empty) row div AND the input inside it.
      row.tabIndex = -1
      const input = el('input', 'app-popover-search', null)
      input.placeholder = 'Full name'
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); const name = sanitizeName(input.value); if (name) onSubmit(name); else showToast('Type a name first.') }
        if (e.key === 'Escape') { e.stopPropagation(); adding = false; render(); row.focus() }
      })
      input.addEventListener('blur', () => { adding = false; render() })
      row.appendChild(input)
      setTimeout(() => input.focus(), 0)
    }
  }
  render()
  return row
}

// Fills a popover list with one focusable row per [value, label] entry.
function appendOptionRows(list, entries, isSelected, onPick) {
  list.setAttribute('role', 'listbox')
  entries.forEach(([value, label]) => {
    const item = el('div', 'app-popover-item' + (isSelected(value) ? ' selected' : ''), label)
    focusableRow(item, () => onPick(value, label))
    list.appendChild(item)
  })
}

function popoverOptionsList(names, isSelected, onPick) {
  const search = el('input', 'app-popover-search', null)
  search.placeholder = 'Search…'
  const list = el('div', 'app-popover-list', null)
  function renderList() {
    list.innerHTML = ''
    const q = search.value.trim().toLowerCase()
    const filtered = q ? names.filter(n => n.toLowerCase().includes(q)) : names
    if (!filtered.length) { list.appendChild(el('div', 'app-popover-empty', 'No matches')); return }
    appendOptionRows(list, filtered.map(n => [n, n]), isSelected, onPick)
  }
  search.addEventListener('input', renderList)
  renderList()
  return { search, list }
}

// Compact multi-select: chips plus a trigger that opens the popover. allNames is a list, or a function read each time the popover opens. The popover also offers
// names typed fresh, so a first-use account has something to pick.
function multiPicker(allNames, selectedNames, onChange, placeholder) {
  const wrap = el('div', 'overview-chip-row', null)
  selectedNames.forEach(n => wrap.appendChild(appChip(n, () => {
    onChange(selectedNames.filter(x => x !== n))
  })))
  const trigger = buttonEl('card-owner-btn popover-trigger', '+ ' + (placeholder || 'Add…'))
  trigger.addEventListener('click', () => {
    openPopover(trigger, (pop, close) => {
      const remaining = (typeof allNames === 'function' ? allNames() : allNames).filter(n => !selectedNames.includes(n))
      const { search, list } = popoverOptionsList(remaining, () => false, n => { close(); onChange([...selectedNames, n]) })
      pop.appendChild(search)
      pop.appendChild(list)
      pop.appendChild(popoverAddNewRow(name => { close(); if (!selectedNames.includes(name)) onChange([...selectedNames, name]) }))
    })
  })
  wrap.appendChild(trigger)
  return wrap
}

// Lists every name in the internal-team pool (Director, Manager, Account Team) with a Remove
// that clears it from all three fields at once, through state.js's removeTeamMember().
function openRosterModal(bg, onRemove) {
  showModal({
    title: 'Team roster',
    hideActions: true,
    bodyBuilder: body => {
      const names = getTeamNames(bg)
      const row = el('div', 'overview-chip-row', null)
      const emptyNote = el('span', 'overview-empty-italic', 'No team members yet.')
      if (!names.length) row.appendChild(emptyNote)
      names.forEach(n => {
        const chip = appChip(n, () => { onRemove(n); chip.remove(); if (!row.children.length) row.appendChild(emptyNote) })
        row.appendChild(chip)
      })
      body.appendChild(row)
    },
  })
}

// Single-select person picker with an inline "+ Add new…" row. A new name is also written into
// account_team, so every other picker sourced from the same pool offers it at once.
function personSelectEl(value, onChange, className) {
  const trigger = buttonEl((className || 'card-owner-btn') + ' popover-trigger', value || 'Select person…')
  let selected = value // a new-record row never re-renders, so the picker keeps its own selection
  trigger.addEventListener('click', () => {
    openPopover(trigger, (pop, close) => {
      const names = getTeamNames(state.background)
      if (selected) {
        const clearRow = el('div', 'app-popover-item app-popover-clear', 'Clear selection')
        const clear = () => { selected = ''; trigger.textContent = 'Select person…'; close(); onChange('') }
        focusableRow(clearRow, clear)
        const clearList = el('div', null, null); clearList.setAttribute('role', 'listbox')
        clearList.appendChild(clearRow)
        pop.appendChild(clearList)
      }
      const { search, list } = popoverOptionsList(names, n => n === selected, n => { selected = n; trigger.textContent = n; close(); onChange(n) })
      pop.appendChild(search)
      pop.appendChild(list)
      pop.appendChild(popoverAddNewRow(name => {
        if (!getTeamNames(state.background).includes(name)) {
          state.background.account_team = [...toArray(state.background.account_team), name].join('; ')
          state.background.last_updated = today()
          persist()
        }
        selected = name
        trigger.textContent = name
        close()
        onChange(name)
      }))
    })
  })
  return trigger
}

// Single-select popover for a fixed set of options (status, sentiment, frequency, sort): the
// popover above without the search box and the "+ Add new" row.
function singleSelectEl(options, selected, onChange, className) {
  function labelFor(v) {
    const found = options.find(([val]) => val === v)
    return found ? found[1] : (v || (options[0] ? options[0][1] : ''))
  }
  const trigger = buttonEl(className || 'card-owner-btn popover-trigger', labelFor(selected))
  trigger.addEventListener('click', () => {
    openPopover(trigger, (pop, close) => {
      const list = el('div', 'app-popover-list', null)
      // A button does not show the picked option by itself. Update the label and the selected
      // state here, because an unsaved inline new-record row never re-renders on its own.
      appendOptionRows(list, options, v => v === selected, (value, label) => {
        selected = value
        trigger.textContent = label
        close()
        onChange(value)
      })
      pop.appendChild(list)
    })
  })
  return trigger
}
