import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { ClientChannel } from 'ssh2'
import type {
  CommandRecord,
  ConnectionState,
  HostConfig,
  RiskLevel,
  RunResult,
  ServerFacts
} from '@shared/types'
import { SshConnection, SshError, type ExecOptions } from './connection'
import { registry } from '../actions/registry'
import { labelFor, type ActionContext } from '../actions/types'
import { store } from '../store/vault'

const AUDIT_LIMIT = 500
const OUTPUT_PREVIEW = 24_000

interface Entry {
  conn: SshConnection
  state: ConnectionState
  cache: Map<string, unknown>
}

interface TerminalSession {
  id: string
  hostId: string
  channel: ClientChannel
}

/**
 * Owns every live SSH connection, every command that has ever run, and the
 * interactive terminal channels. The renderer never touches ssh2 directly. It
 * asks for actions, and this class turns them into recorded commands.
 */
export class SshManager extends EventEmitter {
  private entries = new Map<string, Entry>()
  private terminals = new Map<string, TerminalSession>()
  private audit: CommandRecord[] = []

  // connections

  getState(hostId: string): ConnectionState {
    return this.entries.get(hostId)?.state ?? { hostId, status: 'disconnected' }
  }

  allStates(): ConnectionState[] {
    return [...this.entries.values()].map((e) => e.state)
  }

  private setState(hostId: string, patch: Partial<ConnectionState>): void {
    const entry = this.entries.get(hostId)
    const next: ConnectionState = { ...(entry?.state ?? { hostId, status: 'disconnected' }), ...patch }
    if (entry) entry.state = next
    this.emit('connection', next)
  }

  async connect(host: HostConfig): Promise<ConnectionState> {
    const existing = this.entries.get(host.id)
    if (existing?.conn.ready) return existing.state

    if (existing) existing.conn.dispose()

    const conn = new SshConnection(host)
    const entry: Entry = {
      conn,
      state: { hostId: host.id, status: 'connecting' },
      cache: new Map()
    }
    this.entries.set(host.id, entry)
    this.emit('connection', entry.state)

    conn.on('close', () => {
      if (this.entries.get(host.id)?.conn === conn) {
        this.setState(host.id, { status: 'disconnected', facts: undefined, message: undefined })
      }
      for (const [id, session] of this.terminals) {
        if (session.hostId === host.id) {
          this.terminals.delete(id)
          this.emit('terminal:exit', { sessionId: id })
        }
      }
    })
    conn.on('error', (err: Error) => {
      this.setState(host.id, { status: 'error', message: err.message })
    })

    try {
      const facts = await conn.connect()
      this.setState(host.id, {
        status: 'connected',
        facts,
        connectedAt: Date.now(),
        message: undefined
      })
      store.touchHost(host.id)
      return this.getState(host.id)
    } catch (err) {
      conn.dispose()
      this.entries.delete(host.id)
      const message = err instanceof SshError ? err.message : (err as Error).message
      this.setState(host.id, { status: 'error', message })
      throw new SshError(message, err instanceof SshError ? err.detail : undefined)
    }
  }

  disconnect(hostId: string): void {
    for (const [id, session] of this.terminals) {
      if (session.hostId === hostId) {
        try {
          session.channel.end()
        } catch {
          /* noop */
        }
        this.terminals.delete(id)
        this.emit('terminal:exit', { sessionId: id })
      }
    }
    const entry = this.entries.get(hostId)
    entry?.conn.dispose()
    this.entries.delete(hostId)
    this.setState(hostId, { status: 'disconnected', facts: undefined })
  }

  disconnectAll(): void {
    for (const hostId of [...this.entries.keys()]) this.disconnect(hostId)
  }

  requireEntry(hostId: string): Entry {
    const entry = this.entries.get(hostId)
    if (!entry || !entry.conn.ready) throw new SshError('That host is not connected.')
    return entry
  }

  facts(hostId: string): ServerFacts {
    const entry = this.requireEntry(hostId)
    if (!entry.conn.facts) throw new SshError('Server details are still loading.')
    return entry.conn.facts
  }

  // The action runner: the single door every GUI click goes through.

  async runAction<R = unknown>(
    hostId: string,
    actionId: string,
    params: Record<string, unknown> = {},
    origin: CommandRecord['origin'] = 'gui'
  ): Promise<RunResult<R>> {
    const def = registry.get(actionId)
    if (!def) throw new SshError(`Unknown action "${actionId}".`)

    const entry = this.requireEntry(hostId)
    const facts = this.facts(hostId)
    const ctx: ActionContext = {
      hostId,
      conn: entry.conn,
      facts,
      cache: entry.cache,
      exec: (command, options) => entry.conn.exec(command, options)
    }

    const settings = store.getSettings()
    const record: CommandRecord = {
      id: randomUUID(),
      hostId,
      actionId,
      label: labelFor(def, params),
      command: '',
      transport: def.transport ?? 'shell',
      risk: def.risk,
      origin,
      status: 'running',
      startedAt: Date.now()
    }

    /* ---- dry run: show the command, change nothing ---- */
    if (settings.dryRun && def.risk !== 'read') {
      let command = ''
      try {
        command = def.preview
          ? def.preview(params, ctx)
          : def.build
            ? def.build(params as never, ctx)
            : '(no command — this action runs over SFTP)'
      } catch (err) {
        command = `(could not build command: ${(err as Error).message})`
      }
      const finished = Date.now()
      const dry: CommandRecord = {
        ...record,
        command: this.decorate(command, def.privileged, facts, entry.conn.config),
        status: 'dry-run',
        finishedAt: finished,
        durationMs: finished - record.startedAt,
        stdout: 'Dry run — nothing was executed on the server.'
      }
      this.pushAudit(dry)
      return { ok: false, error: 'DRY_RUN', record: dry }
    }

    const execOptions: ExecOptions = {
      privileged: def.privileged,
      timeoutMs: def.timeoutMs ?? 60_000
    }

    try {
      if (def.custom) {
        const result = await def.custom(params, ctx)
        const finished = Date.now()
        const done: CommandRecord = {
          ...record,
          command: result.command,
          transport: result.transport ?? def.transport ?? 'sftp',
          status: 'success',
          finishedAt: finished,
          durationMs: finished - record.startedAt,
          exitCode: result.exitCode ?? 0,
          stdout: clamp(result.stdout ?? '')
        }
        this.pushAudit(done)
        return { ok: true, data: result.data as R, record: done }
      }

      if (!def.build) throw new SshError(`Action "${actionId}" has nothing to run.`)
      const command = def.build(params as never, ctx)
      const out = await entry.conn.exec(command, execOptions)
      const finished = Date.now()
      const failed = out.code !== 0 && !def.allowFailure

      const done: CommandRecord = {
        ...record,
        command: out.executed,
        status: failed ? 'error' : 'success',
        finishedAt: finished,
        durationMs: finished - record.startedAt,
        exitCode: out.code,
        stdout: clamp(out.stdout),
        stderr: clamp(out.stderr),
        truncated: out.truncated
      }
      this.pushAudit(done)

      if (failed) {
        return {
          ok: false,
          error: cleanError(out.stderr) || cleanError(out.stdout) || `Exit code ${out.code}`,
          record: done
        }
      }

      const data = def.parse ? def.parse(out, params as never, ctx) : (out.stdout as unknown)
      return { ok: true, data: data as R, record: done }
    } catch (err) {
      const finished = Date.now()
      const done: CommandRecord = {
        ...record,
        command: record.command || safeBuild(def, params, ctx),
        status: 'error',
        finishedAt: finished,
        durationMs: finished - record.startedAt,
        stderr: (err as Error).message
      }
      this.pushAudit(done)
      return { ok: false, error: (err as Error).message, record: done }
    }
  }

  /** run an arbitrary command the user typed themselves */
  async runRaw(
    hostId: string,
    command: string,
    privileged = false,
    origin: CommandRecord['origin'] = 'manual'
  ): Promise<RunResult<string>> {
    const entry = this.requireEntry(hostId)
    const record: CommandRecord = {
      id: randomUUID(),
      hostId,
      actionId: 'raw.exec',
      label: 'Manual command',
      command,
      transport: 'shell',
      risk: 'write',
      origin,
      status: 'running',
      startedAt: Date.now()
    }
    try {
      const out = await entry.conn.exec(command, { privileged, timeoutMs: 120_000 })
      const finished = Date.now()
      const done: CommandRecord = {
        ...record,
        command: out.executed,
        status: out.code === 0 ? 'success' : 'error',
        finishedAt: finished,
        durationMs: finished - record.startedAt,
        exitCode: out.code,
        stdout: clamp(out.stdout),
        stderr: clamp(out.stderr)
      }
      this.pushAudit(done)
      return {
        ok: out.code === 0,
        data: out.stdout + (out.stderr ? `\n${out.stderr}` : ''),
        error: out.code === 0 ? undefined : cleanError(out.stderr) || `Exit code ${out.code}`,
        record: done
      }
    } catch (err) {
      const finished = Date.now()
      const done: CommandRecord = {
        ...record,
        status: 'error',
        finishedAt: finished,
        durationMs: finished - record.startedAt,
        stderr: (err as Error).message
      }
      this.pushAudit(done)
      return { ok: false, error: (err as Error).message, record: done }
    }
  }

  /** build the command for an action without running it (used by the UI preview) */
  previewAction(
    hostId: string,
    actionId: string,
    params: Record<string, unknown> = {}
  ): { command: string; label: string; risk: RiskLevel; privileged: boolean } {
    const def = registry.get(actionId)
    if (!def) throw new SshError(`Unknown action "${actionId}".`)
    const entry = this.requireEntry(hostId)
    const facts = this.facts(hostId)
    const ctx: ActionContext = {
      hostId,
      conn: entry.conn,
      facts,
      cache: entry.cache,
      exec: (command, options) => entry.conn.exec(command, options)
    }
    const raw = def.preview
      ? def.preview(params, ctx)
      : def.build
        ? def.build(params as never, ctx)
        : '# runs over SFTP, no shell command'
    return {
      command: this.decorate(raw, def.privileged, facts, entry.conn.config),
      label: labelFor(def, params),
      risk: def.risk,
      privileged: Boolean(def.privileged)
    }
  }

  private decorate(
    command: string,
    privileged: boolean | undefined,
    facts: ServerFacts,
    config: HostConfig
  ): string {
    if (!privileged || facts.isRoot || !config.useSudo) return command
    return `sudo ${command}`
  }

  // audit trail

  private pushAudit(record: CommandRecord): void {
    this.audit.push(record)
    if (this.audit.length > AUDIT_LIMIT) this.audit.splice(0, this.audit.length - AUDIT_LIMIT)
    this.emit('command', record)
  }

  getAudit(hostId?: string): CommandRecord[] {
    return hostId ? this.audit.filter((r) => r.hostId === hostId) : [...this.audit]
  }

  clearAudit(): void {
    this.audit = []
    this.emit('audit:cleared')
  }

  // terminals

  async openTerminal(hostId: string, cols: number, rows: number): Promise<string> {
    const entry = this.requireEntry(hostId)
    const channel = await entry.conn.shell(cols || 80, rows || 24)
    const sessionId = randomUUID()
    this.terminals.set(sessionId, { id: sessionId, hostId, channel })

    channel.on('data', (chunk: Buffer) => {
      this.emit('terminal:data', { sessionId, data: chunk.toString('utf8') })
    })
    channel.stderr?.on('data', (chunk: Buffer) => {
      this.emit('terminal:data', { sessionId, data: chunk.toString('utf8') })
    })
    channel.on('close', () => {
      this.terminals.delete(sessionId)
      this.emit('terminal:exit', { sessionId })
    })

    return sessionId
  }

  writeTerminal(sessionId: string, data: string): void {
    this.terminals.get(sessionId)?.channel.write(data)
  }

  resizeTerminal(sessionId: string, cols: number, rows: number): void {
    const session = this.terminals.get(sessionId)
    if (!session) return
    try {
      session.channel.setWindow(rows, cols, rows * 17, cols * 8)
    } catch {
      /* channel may already be closing */
    }
  }

  closeTerminal(sessionId: string): void {
    const session = this.terminals.get(sessionId)
    if (!session) return
    try {
      session.channel.end()
    } catch {
      /* noop */
    }
    this.terminals.delete(sessionId)
  }
}

function clamp(text: string): string {
  if (!text) return ''
  return text.length > OUTPUT_PREVIEW
    ? `${text.slice(0, OUTPUT_PREVIEW)}\n… output truncated (${text.length} bytes)`
    : text
}

function cleanError(text: string): string {
  return (text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^\[sudo\] password/i.test(l) && !/^sudo: a (terminal|password)/i.test(l))
    .slice(0, 4)
    .join(' · ')
}

function safeBuild(
  def: { build?: (p: never, c: ActionContext) => string; preview?: (p: unknown, c: ActionContext) => string },
  params: unknown,
  ctx: ActionContext
): string {
  try {
    if (def.preview) return def.preview(params, ctx)
    if (def.build) return def.build(params as never, ctx)
  } catch {
    /* ignore */
  }
  return ''
}

export const sshManager = new SshManager()
