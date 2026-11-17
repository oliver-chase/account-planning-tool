// Checks the repo's structure contract: no legacy backlog.md remains under .github, and every scripts/ file
// that package.json's scripts name exists and is git-tracked. Run from the repo root: node scripts/check-structure-contract.mjs
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()
const failures = []

// A plain walk, because readdirSync's recursive option needs Node 20.
function backlogFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return backlogFiles(path)
    return entry.name.toLowerCase() === 'backlog.md' ? [path] : []
  })
}

const githubDir = join(ROOT, '.github')
if (existsSync(githubDir)) {
  for (const file of backlogFiles(githubDir)) failures.push(`legacy backlog.md should be retired: ${relative(ROOT, file)}`)
}

if (existsSync(join(ROOT, 'package.json'))) {
  let tracked = null
  const isTracked = (ref) => {
    if (!tracked) {
      try {
        tracked = new Set(execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n'))
      } catch {
        tracked = new Set()
        failures.push('unable to determine git-tracked files for structure contract')
      }
    }
    return tracked.has(ref)
  }
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    for (const command of Object.values(pkg?.scripts ?? {})) {
      if (typeof command !== 'string') continue
      for (const ref of command.match(/scripts\/[A-Za-z0-9._/-]+\.(?:mjs|cjs|js|sql|sh|py)(?![A-Za-z0-9])/g) ?? []) {
        if (!existsSync(join(ROOT, ref))) failures.push(`package.json references missing build/runtime script: ${ref}`)
        else if (!isTracked(ref)) failures.push(`package.json references a build/runtime script that is not git-tracked: ${ref}`)
      }
    }
  } catch {
    failures.push('unable to parse package.json for script reference validation')
  }
}

if (failures.length > 0) {
  console.error('check-structure-contract: failed')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('check-structure-contract: clean')
