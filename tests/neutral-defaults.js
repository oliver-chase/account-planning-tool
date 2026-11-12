'use strict'
// Shipped files carry no employer, client or owner identifiers, and the brand values agree.
// Run: node tests/neutral-defaults.js
const fs = require('fs'), path = require('path'), assert = require('assert')
const root = path.join(__dirname, '..')

// Every tracked text file is checked, including the built page people download, except the vendored
// library and the binary fixture.
const shipped = require('child_process').execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(f => f && !/xlsx/.test(f))
// Words that identify a person or company are not stored in this repo. List them, one per line, in
// tests/banned-words.local.txt (untracked), or in the BANNED_WORDS variable when that file is missing,
// separated by commas. With no list the word check is skipped and the other checks still run.
const local = path.join(__dirname, 'banned-words.local.txt')
const words = (fs.existsSync(local) ? fs.readFileSync(local, 'utf8').split('\n') : (process.env.BANNED_WORDS || '').split(','))
  .map(w => w.trim()).filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
const banned = words.length ? new RegExp(words.join('|'), 'i') : null
if (!banned) console.log('neutral-defaults: no banned-words list, skipping the word check')
const hits = []
for (const f of shipped) fs.readFileSync(path.join(root, f), 'utf8').split('\n').forEach((line, i) => { if (banned && banned.test(line)) hits.push(f + ':' + (i + 1) + ': ' + line.trim().slice(0, 80)) })
assert.deepStrictEqual(hits, [], 'employer or owner identifiers found:\n' + hits.join('\n'))


// The brand values in js/brand.js and css/tokens.css agree.
const brand = fs.readFileSync(path.join(root, 'js/brand.js'), 'utf8')
const tokens = fs.readFileSync(path.join(root, 'css/tokens.css'), 'utf8')
const get = (src, re) => { const m = src.match(re); assert.ok(m, 'missing brand value: ' + re); return m[1] }
assert.strictEqual(get(brand, /primary: '(#[0-9a-f]{6})'/i), get(tokens, /--color-brand-primary:(#[0-9a-f]{6})/i))
assert.strictEqual(get(brand, /accent: '(#[0-9a-f]{6})'/i), get(tokens, /--color-brand-accent:(#[0-9a-f]{6})/i))

assert.strictEqual(get(brand, /internal: '(#[0-9a-f]{6})'/i), get(tokens, /--color-worker-internal:(#[0-9a-f]{6})/i))
assert.strictEqual(get(brand, /contractor: '(#[0-9a-f]{6})'/i), get(tokens, /--color-worker-contractor:(#[0-9a-f]{6})/i))
assert.strictEqual(get(brand, /fontFamily: "([^"]+)"/), get(tokens, /--font-family-base:([^;]+);/))

console.log('neutral-defaults: ok')
