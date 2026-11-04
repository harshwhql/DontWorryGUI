// Bundles the smoke test (resolving the @shared alias) and runs it under Node.
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
// keep the bundle inside the project so `require('ssh2')` resolves
const outDir = join(root, 'out/smoke')
mkdirSync(outDir, { recursive: true })
const outFile = join(outDir, 'smoke.cjs')

await build({
  entryPoints: [join(root, 'scripts/smoke-test.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: outFile,
  external: ['ssh2'],
  alias: { '@shared': join(root, 'src/shared') },
  logLevel: 'warning'
})

const child = spawn(process.execPath, [outFile], { stdio: 'inherit', cwd: root, env: process.env })
child.on('exit', (code) => process.exit(code ?? 1))
