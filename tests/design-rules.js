'use strict'
// Screens take colors from tokens: no hex color in a screen script. The pages the
// tool generates for download may carry their own.
// Run: node tests/design-rules.js
const fs = require('fs'), path = require('path'), assert = require('assert')
const root = path.join(__dirname, '..')
const read = f => fs.readFileSync(path.join(root, f), 'utf8')

// Files that build standalone pages for download may carry their own CSS and hex colors.
const generated = ['js/export.js', 'js/orgchart-export.js', 'js/call-summary.js', 'js/brand.js']
const screens = fs.readdirSync(path.join(root, 'js')).filter(f => !/xlsx/.test(f)).map(f => 'js/' + f).filter(f => !generated.includes(f))
const hex = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/
const hits = []
for (const f of screens) read(f).split('\n').forEach((line, i) => { if (hex.test(line) && !/^\s*\/\//.test(line)) hits.push(f + ':' + (i + 1) + ': ' + line.trim().slice(0, 70)) })
assert.deepStrictEqual(hits, [], 'a screen writes a hex color; use a token from css/tokens.css:\n' + hits.join('\n'))

// Every var(--name) in the styles and scripts has a definition.
const all = [...fs.readdirSync(path.join(__dirname, '..', 'css')).map(f => 'css/' + f), ...fs.readdirSync(path.join(__dirname, '..', 'js')).filter(f => !/xlsx/.test(f)).map(f => 'js/' + f), 'index.html']
const text = all.map(read).join('\n')
const defined = new Set([...text.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]))
const undef = [...new Set([...text.matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]))].filter(n => !defined.has(n))
assert.deepStrictEqual(undef, [], 'a var() has no definition: ' + undef.join(', '))

console.log('design-rules: ok')
