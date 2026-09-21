// Runs every accounting / logic test:  npm test
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))
const files = readdirSync(dir).filter((f) => /^test-.*\.mjs$/.test(f)).sort()
let failed = 0
for (const f of files) {
  console.log(`\n=== ${f} ===`)
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(path.join(dir, 'register.mjs')).href, path.join(dir, f)], { stdio: 'inherit' })
  if (r.status !== 0) failed++
}
console.log(failed ? `\n${failed} test file(s) FAILED` : `\nAll ${files.length} test files passed`)
process.exit(failed ? 1 : 0)
