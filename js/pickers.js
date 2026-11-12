'use strict';
// Popovers and the pickers built on them: people, multi-select and fixed lists.

// ---- Popover picker ----
// A bordered, shadowed list with a live search box, per-item hover and selected state and an
// inline "add new" row. A native <select> cannot draw those.
let openPopoverState = null // { el, cleanup } — only one popover open at a time app-wide

function closeOpenPopover() {
  if (!openPopoverState) return
  openPopoverState.cleanup()
  openPopoverState.el.remove()
  openPopoverState = null
}

// Every focusable row inside a popover goes through this, so Tab, Shift+Tab and the arrow keys
// reach all of them. A plain clickable div with no tabindex is invisible to a keyboard user.
function focusableRow(rowEl, onActivate) {
  rowEl.setAttribute('role', 'option')
  return makeActivatable(rowEl, null, onActivate)
}

function openPopover(anchor, buildContent) {
  closeOpenPopover()
  const pop = el('div', 'app-popover', null)
  pop.setAttribute('role', 'listbox')
  anchor.setAttribute('aria-haspopup', 'listbox'); anchor.setAttribute('aria-expanded', 'true')
  const rect = anchor.getBoundingClientRect()
  pop.style.position = 'fixed'
  pop.style.top = Math.min(rect.bottom + 4, window.innerHeight - 120) + 'px'
  pop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 260)) + 'px'
  document.body.appendChild(pop)
  try {
    buildContent(pop, closeOpenPopover)
  } catch (e) {
    pop.remove()
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
  openPopoverState = { el: pop, cleanup: () => { document.removeEventListener('mousedown', onDocMouseDown); document.removeEventListener('keydown', onKey); anchor.setAttribute('aria-expanded', 'false') } }
  const search = pop.querySelector('.app-popover-search')
  if (search) search.focus()
}

// "+ Add new…" turns into a text input in place: Enter submits, Escape or blur cancels.
function popoverAddNewRow(onSubmit) {
  let adding = false
  const row = el('div', 'app-popover-add-new', null)
  row.tabIndex = 0
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
      input.style.border = 'none'
      input.style.width = '100%'
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); const name = sanitizeName(input.value); if (name) onSubmit(name); else showToast('Type a name first.') }
        if (e.key === 'Escape') { e.stopPropagation(); adding = false; render() }
      })
      input.addEventListener('blur', () => { adding = false; render() })
      row.appendChild(input)
      setTimeout(() => input.focus(), 0)
    }
  }
  render()
  return row
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
    filtered.forEach(n => {
      const item = el('div', 'app-popover-item' + (isSelected(n) ? ' selected' : ''), n)
      const pick = () => onPick(n)
      item.addEventListener('click', pick)
      focusableRow(item, pick)
      list.appendChild(item)
    })
  }
  search.addEventListener('input', renderList)
  renderList()
  return { search, list }
}

// Compact multi-select: chips plus a trigger that opens the popover. The popover also offers
// names typed fresh, so a first-use account has something to pick.
function multiPicker(allNames, selectedNames, onChange, placeholder) {
  const wrap = el('div', 'overview-chip-row', null)
  function render() {
    wrap.innerHTML = ''
    selectedNames.forEach(n => wrap.appendChild(appChip(n, () => {
      onChange(selectedNames.filter(x => x !== n))
    })))
    const trigger = el('button', 'card-owner-btn popover-trigger', '+ ' + (placeholder || 'Add…'))
    trigger.type = 'button'
    trigger.addEventListener('click', () => {
      openPopover(trigger, (pop, close) => {
        const remaining = allNames.filter(n => !selectedNames.includes(n))
        const { search, list } = popoverOptionsList(remaining, () => false, n => { onChange([...selectedNames, n]); close() })
        pop.appendChild(search)
        pop.appendChild(list)
        pop.appendChild(popoverAddNewRow(name => { if (!selectedNames.includes(name)) onChange([...selectedNames, name]); close() }))
      })
    })
    wrap.appendChild(trigger)
  }
  render()
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
      if (!names.length) row.appendChild(el('span', 'overview-empty-italic', 'No team members yet.'))
      names.forEach(n => {
        const chip = appChip(n, () => { onRemove(n); chip.remove() })
        row.appendChild(chip)
      })
      body.appendChild(row)
    },
  })
}

// Single-select person picker with an inline "+ Add new…" row. A new name is also written into
// account_team, so every other picker sourced from the same pool offers it at once.
function personSelectEl(value, onChange, className) {
  const trigger = el('button', (className || 'card-owner-btn') + ' popover-trigger', value || 'Select person…')
  trigger.type = 'button'
  trigger.addEventListener('click', () => {
    openPopover(trigger, (pop, close) => {
      const names = getTeamNames(state.background)
      if (value) {
        const clearRow = el('div', 'app-popover-item', 'Clear selection')
        clearRow.style.color = 'var(--color-text-secondary)'
        clearRow.style.fontStyle = 'italic'
        const clear = () => { onChange(''); close() }
        clearRow.addEventListener('click', clear)
        focusableRow(clearRow, clear)
        pop.appendChild(clearRow)
      }
      const { search, list } = popoverOptionsList(names, n => n === value, n => { trigger.textContent = n; onChange(n); close() })
      pop.appendChild(search)
      pop.appendChild(list)
      pop.appendChild(popoverAddNewRow(name => {
        if (!getTeamNames(state.background).includes(name)) {
          state.background.account_team = [...toArray(state.background.account_team), name].join('; ')
          state.background.last_updated = today()
          persist()
        }
        trigger.textContent = name
        onChange(name)
        close()
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
  const trigger = el('button', className || 'card-owner-btn popover-trigger', labelFor(selected))
  trigger.type = 'button'
  trigger.addEventListener('click', () => {
    openPopover(trigger, (pop, close) => {
      const list = el('div', 'app-popover-list', null)
      options.forEach(([value, label]) => {
        const item = el('div', 'app-popover-item' + (value === selected ? ' selected' : ''), label)
        const pick = () => {
          // A button does not show the picked option by itself. Update the label and the selected
          // state here, because an unsaved inline new-record row never re-renders on its own.
          selected = value
          trigger.textContent = label
          onChange(value)
          close()
        }
        item.addEventListener('click', pick)
        focusableRow(item, pick)
        list.appendChild(item)
      })
      pop.appendChild(list)
    })
  })
  return trigger
}
