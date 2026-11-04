/**
 * End-to-end check of the command layer against a real SSH server.
 *
 * Every GUI action is defined by a shell command plus a parser; this harness
 * runs the read-only ones against a live box and prints what came back, so a
 * broken command or a bad parse shows up without clicking through the app.
 *
 *   DWG_HOST=127.0.0.1 DWG_PORT=2222 DWG_USER=root DWG_PASS=secret \
 *     npm run smoke
 */
import { SshConnection } from '../src/main/ssh/connection'
import { registry } from '../src/main/actions/registry'
import type { ActionContext } from '../src/main/actions/types'
import type { HostConfig } from '../src/shared/types'

const config: HostConfig = {
  id: 'smoke',
  label: 'smoke-test',
  host: process.env.DWG_HOST ?? '127.0.0.1',
  port: Number(process.env.DWG_PORT ?? 2222),
  username: process.env.DWG_USER ?? 'root',
  authMethod: 'password',
  password: process.env.DWG_PASS ?? 'testpass123',
  useSudo: true,
  accent: 'emerald',
  keepAliveSeconds: 20,
  createdAt: Date.now()
}

/** read-only actions, with the parameters they need */
const CASES: { id: string; params?: Record<string, unknown> }[] = [
  { id: 'system.metrics' },
  { id: 'system.metrics' }, // twice, so CPU and network deltas have a baseline
  { id: 'system.who' },
  { id: 'processes.list' },
  { id: 'processes.detail', params: { pid: 1 } },
  { id: 'services.list' },
  { id: 'services.timers' },
  { id: 'files.list', params: { path: '/etc' } },
  { id: 'files.home' },
  { id: 'files.read', params: { path: '/etc/hostname' } },
  { id: 'files.largest', params: { path: '/usr/bin' } },
  { id: 'files.search', params: { path: '/etc', query: 'passwd' } },
  { id: 'files.tail', params: { path: '/etc/hosts', lines: 5 } },
  { id: 'packages.installed' },
  { id: 'packages.upgradable' },
  { id: 'packages.search', params: { query: 'htop' } },
  { id: 'network.interfaces' },
  { id: 'network.ports' },
  { id: 'network.routes' },
  { id: 'network.connections' },
  { id: 'network.dns' },
  { id: 'firewall.status' },
  { id: 'users.list' },
  { id: 'users.keys.list', params: { name: 'root' } },
  { id: 'logs.failedUnits' },
  { id: 'logs.files' },
  { id: 'logs.dmesg', params: { lines: 20 } },
  { id: 'logs.lastLogins' },
  { id: 'cron.list' },
  { id: 'cron.raw', params: { user: 'root' } },
  { id: 'docker.containers' },
  // root-only paths: SFTP must be denied and the shell fallback must take over
  { id: 'files.list', params: { path: '/root/secret' } },
  { id: 'files.read', params: { path: '/root/secret/app.conf' } }
]

function summarize(value: unknown): string {
  if (value === undefined || value === null) return 'null'
  if (Array.isArray(value)) {
    const sample = value[0]
    return `array(${value.length})${sample !== undefined ? ` first=${trim(JSON.stringify(sample), 150)}` : ''}`
  }
  if (typeof value === 'object') return trim(JSON.stringify(value), 220)
  return trim(String(value).replace(/\s+/g, ' '), 150)
}

function trim(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

async function main(): Promise<void> {
  const conn = new SshConnection(config)
  console.log(`→ connecting to ${config.username}@${config.host}:${config.port}`)
  const facts = await conn.connect()

  console.log('\n=== server facts ===')
  console.log(
    [
      `host        ${facts.hostname}`,
      `distro      ${facts.prettyName} (${facts.distroId} ${facts.version})`,
      `kernel      ${facts.kernel} ${facts.arch}`,
      `cpu         ${facts.cpuModel} × ${facts.cpuCores}`,
      `memory      ${(facts.totalMemBytes / 1024 ** 3).toFixed(1)} GiB`,
      `user        ${facts.user} (root=${facts.isRoot}, sudo=${facts.hasSudo})`,
      `pkg manager ${facts.packageManager}`,
      `systemd     ${facts.hasSystemd}`,
      `docker      ${facts.hasDocker ? facts.dockerVersion : 'no'}`,
      `firewall    ${facts.firewall}`,
      `shell       ${facts.shell}`
    ].join('\n')
  )

  const ctx: ActionContext = {
    hostId: 'smoke',
    conn,
    facts,
    cache: new Map(),
    exec: (command, options) => conn.exec(command, options)
  }

  console.log('\n=== read-only actions ===')
  let passed = 0
  let failed = 0
  const problems: string[] = []

  for (const testCase of CASES) {
    const def = registry.get(testCase.id)
    if (!def) {
      problems.push(`${testCase.id}: not in the registry`)
      failed++
      continue
    }

    const started = Date.now()
    try {
      if (def.custom) {
        const result = await def.custom(testCase.params ?? {}, ctx)
        console.log(
          `  ok   ${testCase.id.padEnd(22)} ${String(Date.now() - started).padStart(5)}ms  ${summarize(result.data)}`
        )
        passed++
        continue
      }

      const command = def.build!(testCase.params ?? {}, ctx)
      const out = await conn.exec(command, {
        privileged: def.privileged,
        timeoutMs: def.timeoutMs ?? 60_000
      })

      if (out.code !== 0 && !def.allowFailure) {
        problems.push(
          `${testCase.id}: exit ${out.code} — ${trim((out.stderr || out.stdout).replace(/\s+/g, ' '), 180)}`
        )
        console.log(`  FAIL ${testCase.id.padEnd(22)} exit ${out.code}`)
        failed++
        continue
      }

      const data = def.parse ? def.parse(out, testCase.params ?? {}, ctx) : out.stdout
      const empty =
        data === undefined ||
        (Array.isArray(data) && data.length === 0) ||
        (typeof data === 'string' && data.trim() === '')

      console.log(
        `  ${empty ? 'warn' : 'ok  '} ${testCase.id.padEnd(22)} ${String(Date.now() - started).padStart(5)}ms  ${summarize(data)}`
      )
      if (empty) problems.push(`${testCase.id}: parsed to an empty result`)
      passed++
    } catch (err) {
      console.log(`  FAIL ${testCase.id.padEnd(22)} ${(err as Error).message}`)
      problems.push(`${testCase.id}: threw — ${(err as Error).message}`)
      failed++
    }
  }

  console.log('\n=== write path (sudo + stdin) ===')
  const writeChecks: { label: string; command: string; privileged: boolean }[] = [
    { label: 'mkdir', command: `mkdir -p /tmp/dwg-smoke/nested`, privileged: true },
    { label: 'write file', command: `printf 'hello\\n' > /tmp/dwg-smoke/file.txt`, privileged: true },
    { label: 'chmod', command: `chmod 0640 /tmp/dwg-smoke/file.txt`, privileged: true },
    { label: 'verify', command: `stat -c '%a %U:%G %s' /tmp/dwg-smoke/file.txt`, privileged: false },
    { label: 'cleanup', command: `rm -rf /tmp/dwg-smoke`, privileged: true }
  ]
  for (const check of writeChecks) {
    const out = await conn.exec(check.command, { privileged: check.privileged })
    const label = out.code === 0 ? 'ok  ' : 'FAIL'
    if (out.code !== 0) {
      failed++
      problems.push(`${check.label}: exit ${out.code} — ${trim(out.stderr.replace(/\s+/g, ' '), 140)}`)
    } else {
      passed++
    }
    console.log(`  ${label} ${check.label.padEnd(22)} ${trim(out.stdout.trim(), 80)}`)
  }

  console.log('\n=== write actions through the registry ===')
  const writeActions: { id: string; params: Record<string, unknown>; note: string }[] = [
    { id: 'files.mkdir', params: { path: '/root/secret/dwg' }, note: 'mkdir in a root-only dir' },
    {
      id: 'files.write',
      params: { path: '/root/secret/dwg/test.conf', content: 'key = value\n' },
      note: 'write where SFTP is denied'
    },
    { id: 'files.read', params: { path: '/root/secret/dwg/test.conf' }, note: 'read it back' },
    { id: 'files.chmod', params: { paths: ['/root/secret/dwg/test.conf'], mode: '0600' }, note: 'chmod' },
    { id: 'files.remove', params: { paths: ['/root/secret/dwg'] }, note: 'clean up' }
  ]

  for (const step of writeActions) {
    const def = registry.get(step.id)!
    try {
      let data: unknown
      if (def.custom) {
        data = (await def.custom(step.params, ctx)).data
      } else {
        const out = await conn.exec(def.build!(step.params, ctx), { privileged: def.privileged })
        if (out.code !== 0) throw new Error(out.stderr.trim() || `exit ${out.code}`)
        data = def.parse ? def.parse(out, step.params, ctx) : 'ok'
      }
      console.log(`  ok   ${step.note.padEnd(28)} ${summarize(data)}`)
      passed++
    } catch (err) {
      console.log(`  FAIL ${step.note.padEnd(28)} ${(err as Error).message}`)
      problems.push(`${step.id}: ${(err as Error).message}`)
      failed++
    }
  }

  // sftp round trip
  console.log('\n=== sftp round trip ===')
  try {
    const sftp = await conn.sftp()
    await new Promise<void>((resolve, reject) => {
      const stream = sftp.createWriteStream('/tmp/dwg-sftp-test.txt')
      stream.on('error', reject)
      stream.on('close', () => resolve())
      stream.end(Buffer.from('round trip\n'))
    })
    const read = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = []
      const stream = sftp.createReadStream('/tmp/dwg-sftp-test.txt')
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('error', reject)
      stream.on('close', () => resolve(Buffer.concat(chunks).toString()))
    })
    const matched = read.trim() === 'round trip'
    console.log(`  ${matched ? 'ok  ' : 'FAIL'} sftp write + read back   ${JSON.stringify(read)}`)
    matched ? passed++ : failed++
    await conn.exec('rm -f /tmp/dwg-sftp-test.txt')
  } catch (err) {
    console.log(`  FAIL sftp — ${(err as Error).message}`)
    failed++
    problems.push(`sftp: ${(err as Error).message}`)
  }

  // interactive shell channel
  console.log('\n=== interactive shell channel ===')
  try {
    const channel = await conn.shell(80, 24)
    const output = await new Promise<string>((resolve) => {
      let buffer = ''
      channel.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
        if (buffer.includes('SHELL_OK')) resolve(buffer)
      })
      channel.write('echo SHELL_OK\n')
      setTimeout(() => resolve(buffer), 5000)
    })
    channel.end()
    const ok = output.includes('SHELL_OK')
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} pty echo                 ${ok ? 'shell responded' : 'no response'}`)
    ok ? passed++ : failed++
  } catch (err) {
    console.log(`  FAIL shell — ${(err as Error).message}`)
    failed++
  }

  conn.dispose()

  console.log(`\n=== summary ===\n  ${passed} passed, ${failed} failed`)
  if (problems.length) {
    console.log('\n  notes:')
    for (const problem of problems) console.log(`   - ${problem}`)
  }
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err: Error) => {
  console.error('\nsmoke test could not run:', err.message)
  process.exit(1)
})
