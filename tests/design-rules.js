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

// Fixed looks live in the styles. A script sets a style only for a value it computes: a position, a size, a transform or a data color.
// Fonts, sizes and the z-index scale also live in the styles.
const looseLook = /'font-(size|style)'|z-index:\s*\d{3,}/
const loose = [...screens, ...fs.readdirSync(path.join(root, 'css')).map(f => 'css/' + f)].flatMap(f => read(f).split('\n').map((line, i) => looseLook.test(line) ? f + ':' + (i + 1) : null).filter(Boolean))
assert.deepStrictEqual(loose, [], 'a script sets a font, or a style sheet writes a literal z-index; use a class or a --z- token: ' + loose.join(', '))
const staticStyle = /\.style\.(cssText|display|cursor|position|opacity|whiteSpace|fontStyle|fontSize|zIndex|color|maxWidth)\b/
const styled = screens.flatMap(f => read(f).split('\n').map((line, i) => staticStyle.test(line) ? f + ':' + (i + 1) : null).filter(Boolean))
assert.deepStrictEqual(styled, [], 'a script sets a fixed style; move it to a class in css/: ' + styled.join(', '))

// Every var(--name) in the styles and scripts has a definition.
const all = [...fs.readdirSync(path.join(__dirname, '..', 'css')).map(f => 'css/' + f), ...fs.readdirSync(path.join(__dirname, '..', 'js')).filter(f => !/xlsx/.test(f)).map(f => 'js/' + f), 'index.html']
const text = all.map(read).join('\n')
const cssText = all.filter(f => f.endsWith('.css')).map(read).join('\n') // a token counts only when a style sheet defines it
const defined = new Set([...cssText.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]))
const undef = [...new Set([...text.matchAll(/var\((--[a-z0-9-]+)/g)].map(m => m[1]))].filter(n => !defined.has(n))
assert.deepStrictEqual(undef, [], 'a var() has no definition: ' + undef.join(', '))

// On a phone, an inline editable field, a status badge and a section link keep the 44 px touch height.
const touchBlock = read('css/local.css').split('/* Touch targets')[1].split('/* Delete buttons')[0]
for (const sel of ['[contenteditable]{min-height:var(--touch-target)', '.picker-btn-status,#section-nav a{min-height:var(--touch-target)'])
  assert.ok(touchBlock.includes(sel), 'the touch block lost a rule: ' + sel)

console.log('design-rules: ok')
