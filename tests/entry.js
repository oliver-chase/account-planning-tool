'use strict'
// Editing fields keep line breaks and ignore an unchanged blur, labels are text, Delete offers one Undo,
// and loops in the org chart are cut.
// A clickable element made with makeActivatable opens on Enter and Space, and ignores keys pressed inside it.
// Run: node tests/entry.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert')
const root = path.join(__dirname, '..')
const read = f => fs.readFileSync(path.join(root, f), 'utf8')

function fakeNode(tag) {
  return { tag, className: '', textContent: '', innerText: '', attrs: {}, listeners: {}, children: [], contains: () => false, remove() {},
    setAttribute(k, v) { this.attrs[k] = v }, addEventListener(t, f) { this.listeners[t] = f }, appendChild(c) { this.children.push(c); return c } }
}
const toastBox = fakeNode('div')
const store = {}
const sandbox = { assert, console, toastBox,
  document: { createElement: fakeNode, getElementById: id => (id === 'toast-container' ? toastBox : null), querySelector: () => null, activeElement: null },
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v) } },
  window: { addEventListener(t, f) { if (t === 'pagehide') sandbox.pagehide = f } }, setTimeout: f => { f(); return 1 }, clearTimeout() {},
  renderAll() {} }
const src = ['js/state.js', 'js/ui-helpers.js', 'js/orgchart.js', 'js/actions.js'].map(read).join('\n') + `
// 1. editable keeps line breaks, ignores a focus-and-leave, and opts in for new-item cards.
let saved = []
const multi = editable('div', 'x', 'first', '', v => saved.push(v), { multiline: true })
assert.ok(multi.className.includes('editable-multiline'))
multi.innerText = 'first\\nsecond'; multi.textContent = 'firstsecond'
multi.listeners.blur()
assert.strictEqual(saved[0], 'first\\nsecond', 'the Enter-made line break is kept')
saved = []
const same = editable('div', 'x', 'unchanged', '', v => saved.push(v))
same.textContent = 'unchanged'; same.listeners.blur()
assert.strictEqual(saved.length, 0, 'leaving a field you did not change saves nothing')
const fresh = editable('div', 'x', '', '', v => saved.push(v), { alwaysSave: true })
fresh.textContent = ''; fresh.listeners.blur()
assert.strictEqual(saved.length, 1, 'a new-item card still hears an empty blur')

// 1b. Closing the page saves an edit that was still waiting on its 300 ms timer.
const realTimeout = setTimeout
setTimeout = () => 7
const held = []
const late = editable('div', 'x', 'old', '', v => held.push(v))
late.textContent = 'new'; late.listeners.blur()
assert.strictEqual(held.length, 0, 'the save is still waiting')
pagehide()
assert.strictEqual(held[0], 'new', 'pagehide runs the waiting save')
setTimeout = realTimeout

// 1c. Two saves close together both keep their change, because each reads the stored record.
state.actions = [{ id: 'q', description: 'old', owner: 'Ann', engagement: '', status: 'Open', due_date: '', closed_date: '', created_date: '2026-11-01', last_updated: '2026-11-01' }]
const renderedAction = state.actions[0]
saveAction({ ...currentAction(renderedAction), description: 'new text' })
saveAction({ ...currentAction(renderedAction), owner: 'Bo' })
assert.strictEqual(state.actions[0].description + '|' + state.actions[0].owner, 'new text|Bo', 'the second save keeps the first change')

// 2. A label is text, never markup.
const btn = inlineActionButton('<img src=x onerror=alert(1)>', () => {})
assert.strictEqual(btn.innerHTML, undefined, 'no innerHTML is written')
assert.strictEqual(btn.children[0].textContent, '<img src=x onerror=alert(1)>')

// 3. Delete with Undo puts the item back where it was, once.
state.actions = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
let rendered = 0
deleteWithUndo('actions', { id: 'b' }, 'Action', () => rendered++)
assert.strictEqual(state.actions.map(a => a.id).join(), 'a,c')
assert.strictEqual(rendered, 1)
const toast = toastBox.children[toastBox.children.length - 1]
const undoBtn = toast.children[1]
assert.strictEqual(undoBtn.textContent, 'Undo')
undoBtn.listeners.click(); undoBtn.listeners.click()
assert.strictEqual(state.actions.map(a => a.id).join(), 'a,b,c', 'restored in place, not duplicated')

// 4. A reporting loop does not hide anyone.
const people = [
  { id: 'a', name: 'A', reports_to: 'b' }, { id: 'b', name: 'B', reports_to: 'a' },
  { id: 'c', name: 'C', reports_to: '' }, { id: 'd', name: 'D', reports_to: 'c' },
]
const model = buildOrgModel(people)
assert.strictEqual(model.roots.map(p => p.id).join(), 'c')
assert.strictEqual(model.unassigned.map(p => p.id).sort().join(), 'a,b', 'loop members show in the unassigned zone')
assert.strictEqual(breakReportingCycles(people), 1)
assert.strictEqual(people.filter(p => !p.reports_to).length, 2, 'one line was cut')
const model2 = buildOrgModel(people)
assert.strictEqual(model2.unassigned.length, 0, 'after the cut everyone is on the chart')
assert.strictEqual(breakReportingCycles([{ id: 'x', reports_to: 'x' }]), 1, 'reporting to yourself is a loop')
assert.strictEqual(breakReportingCycles([{ id: 'p', reports_to: 'q' }, { id: 'q', reports_to: '' }]), 0)
// A filter that hides a manager keeps the report on the chart, out of the zone where a drop clears the manager.
const everyone = [{ id: 'carol', reports_to: '' }, { id: 'bob', reports_to: 'carol' }, { id: 'ann', reports_to: '' }]
const shown = buildOrgModel(everyone.filter(p => p.id !== 'carol'), everyone)
assert.strictEqual(shown.roots.map(p => p.id).join(), 'bob')
assert.deepStrictEqual(shown.unassigned.map(p => p.id), ['ann'])

// 5. Sorting by Due puts undated actions last, both ways.
const acts = [{ id: 'x' }, { id: 'b', due_date: '2026-12-01' }, { id: 'a', due_date: '2026-11-01' }]
assert.strictEqual(sortActions(acts, 'due_date', 'asc').map(a => a.id).join(), 'a,b,x')
assert.strictEqual(sortActions(acts, 'due_date', 'desc').map(a => a.id).join(), 'b,a,x')

console.log('entry: ok')
`
sandbox.process = process
vm.runInNewContext(src, sandbox)

// makeActivatable: Enter and Space activate; other keys, and keys typed in a child, do not.
vm.runInNewContext(read('js/ui-helpers.js') + `
const node = { attrs: {}, listeners: {}, setAttribute(k, v) { this.attrs[k] = v }, addEventListener(t, f) { this.listeners[t] = f } }
let count = 0
makeActivatable(node, 'Open plan A', () => count++)
assert.strictEqual(node.tabIndex, 0)
assert.strictEqual(node.attrs['aria-label'], 'Open plan A')
const press = (key, target) => node.listeners.keydown({ key, target: target || node, preventDefault() {} })
press('Enter'); press(' '); assert.strictEqual(count, 2)
press('a'); press('Tab'); assert.strictEqual(count, 2)
press('Enter', {}); assert.strictEqual(count, 2, 'a key typed in a child field is ignored')
`, { assert, window: { addEventListener() {} } })
