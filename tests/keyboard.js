'use strict'
// A clickable element made with makeActivatable opens on Enter and Space, and ignores keys pressed inside it.
// Run: node tests/keyboard.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert')
const root = path.join(__dirname, '..')
const read = f => fs.readFileSync(path.join(root, f), 'utf8')

// makeActivatable: Enter and Space activate; other keys, and keys typed in a child, do not.
const sandbox = { assert, window: { addEventListener() {} } }
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
`, sandbox)

console.log('keyboard: ok')
